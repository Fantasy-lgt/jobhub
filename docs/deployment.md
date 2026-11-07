# JobHub 部署方案与清单

> 适用版本：React18 + Vite 前端 / Fastify4 + Knex3 + mysql2 后端 / 远程 MariaDB。
> 核心结论：**单 Node 进程同时托管 API 与前端静态资源**，靠 `build:deploy` 把前端产物拷进 `server/public`，无需独立静态服务。部署本质 = 构建 + 配 `.env` + 起进程（+ 可选 Nginx 反代上 HTTPS）。

---

## 1. 架构总览

```
                ┌─────────────────────────────────────────────┐
   浏览器 ──────▶│  Nginx (optional, 443 TLS + 域名)            │
                │     proxy_pass http://127.0.0.1:3000        │
                └───────────────────┬─────────────────────────┘
                                    │  (TRUST_PROXY=1)
                                    ▼
                ┌─────────────────────────────────────────────┐
                │  Node (Fastify) 单进程 :3000                  │
                │   · /api/v1/*  业务接口（鉴权 + 路由）         │
                │   · /           静态前端（server/public）      │
                │   · /ready /health 探针                       │
                │   启动自动：迁移 + seed(admin)                │
                └───────────────────┬─────────────────────────┘
                                    │  DB_* 环境变量
                                    ▼
                         远程 MariaDB (已存在)
```

要点：
- **一个进程、一个端口**就够。前端通过同源 `/api` 调接口，生产环境无跨域问题。
- 启动幂等执行迁移与 seed，**不需要手工建表**；结构/DDL 错误会 fail-fast（拒绝 listen），连接类错误降级启动。
- 支持 `SIGTERM`/`SIGINT` 优雅关闭（先停回收站定时器，再关 server 与连接池）。

---

## 2. 三种部署拓扑（简单 → 规范）

| 方案 | 说明 | 适用 | 复杂度 |
|------|------|------|--------|
| **A（推荐）单 VPS + Nginx** | Node 跑 127.0.0.1:3000，Nginx 终结 TLS、反代全部流量 | 个人/小团队长期使用 | ★★☆ |
| **B 裸跑** | Node 直接 `0.0.0.0:3000`，TLS 交给 Cloudflare/CDN | 想最快暴露、不在乎自管证书 | ★☆☆ |
| **C 容器化** | Dockerfile + compose，MariaDB 复用远程 | 需要可复现/易迁移 | ★★★ |

下方清单以 **方案 A** 为主线，方案 C 给出可直接用的 Dockerfile/compose 片段。

---

## 3. 环境配置清单（`server/.env` 生产值）

> 仓库只提交 `jobhub/.env.example`；真实 `server/.env` 不入库，权限建议 `chmod 600`。

```ini
NODE_ENV=production
# 配合 Nginx 时监听回环即可；裸跑（方案 B）改为 0.0.0.0
HOST=127.0.0.1
PORT=3000
# Nginx 一层反代必须设 1（不要设 true，避免 X-Forwarded-For 伪造绕过白名单/限流）
TRUST_PROXY=1

# MariaDB（已存在的远程库；确认用户已授权应用服务器出口 IP）
DB_HOST=68.178.239.252
DB_PORT=3306
DB_USER=Klinevargas
DB_PASSWORD=<生产强密码>
DB_NAME=jobhub
DB_SSL=false

# 鉴权
JWT_SECRET=<32+ 位随机串，例：openssl rand -base64 32>
ADMIN_PASSWORD=<首次 admin 登录密码，务必显式设置>
# 外部程序/豆包导入用的 API Key（留空则禁用该通道，仅允许浏览器 cookie 登录）
JOBHUB_API_KEY=<openssl rand -base64 24>
JOBHUB_API_KEY_ALLOW_IPS=

# DeepSeek（AI 逐题分析；不填则自动降级为机检模式）
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=60000
DEEPSEEK_MAX_RETRIES=2
DEEPSEEK_MAX_TOKENS=2000
```

**关键约束（来自 `config.ts`）：**
- `NODE_ENV=production` 时 `assertProductionConfig()` 强制要求 `JWT_SECRET` 与 `ADMIN_PASSWORD`，缺失直接拒绝启动。
- `JWT_SECRET` **必须稳定且保密**：改了会让所有已签发登录态（cookie）立即失效，用户需重新登录。
- `ADMIN_PASSWORD` 务必显式设置——若不设，seed 只在**日志**打印一次性登录码，生产环境不易看到。

---

## 4. 构建与发布清单

在**构建机或目标服务器**执行：

```bash
# 1) 安装依赖（pnpm workspace 依赖在根 node_modules，server/node_modules 为符号链接）
pnpm install

# 2) 全量构建 + 前端产物拷入 server/public
pnpm build:deploy
#   等价于 pnpm build（server tsc + client tsc+vite）再执行 scripts/prepare-public.mjs

# 3)（可选）类型检查
pnpm typecheck
```

**部署产物（可直接打包拷贝的部分）：**
```
jobhub/server/dist/      # 编译后的 Node 服务
jobhub/server/public/    # 前端静态产物（index.html + assets）
jobhub/server/node_modules/  # 运行依赖（含根 node_modules 符号链接，需整体拷贝）
jobhub/server/.env       # 生产环境变量
```

最简做法：把整个 `jobhub/` 目录（已 install + build 后）拷到服务器，运行目录锁定在 `jobhub/server/`。

---

## 5. 进程托管清单

### 5.1 systemd（推荐，开机自启 + 崩溃重启）

`/etc/systemd/system/jobhub.service`：
```ini
[Unit]
Description=JobHub
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/jobhub/server
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
EnvironmentFile=/opt/jobhub/server/.env
Restart=on-failure
RestartSec=5
User=jobhub
# 限制资源（可选）
# MemoryLimit=512M

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jobhub
journalctl -u jobhub -f   # 看日志（含迁移/seed、一次性码、回收站清理）
```

### 5.2 pm2（轻量）

```bash
pnpm add -g pm2
cd /opt/jobhub/server
pm2 start dist/index.js --name jobhub --env production
pm2 save && pm2 startup   # 开机自启
pm2 logs jobhub
```

### 5.3 Docker（方案 C）

`jobhub/Dockerfile`：
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm build:deploy

FROM node:20-alpine
WORKDIR /app/server
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/public ./public
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/node_modules /app/node_modules
ENV NODE_ENV=production HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "dist/index.js"]
```
`jobhub/docker-compose.yml`（MariaDB 复用远程，仅起 app）：
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: ./server/.env
    restart: unless-stopped
```

---

## 6. 反向代理（Nginx）清单（方案 A）

`/etc/nginx/sites-available/jobhub`：
```nginx
server {
    listen 80;
    server_name jobhub.example.com;
    # 先 certbot 申请证书后再补 443 段；此处仅做 ACME 校验跳转
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name jobhub.example.com;

    ssl_certificate     /etc/letsencrypt/live/jobhub.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jobhub.example.com/privkey.pem;

    # 前端静态资源长缓存（build:deploy 产物带 contenthash）
    location /assets/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 7d;
        expires 7d;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # AI 分析接口可能较久，放宽超时
        proxy_read_timeout 120s;
    }
}
```
```bash
sudo certbot --nginx -d jobhub.example.com
sudo nginx -t && sudo systemctl reload nginx
```
> AI 路由（`/ai/*`）均为普通 POST，无 SSE 长连，Nginx 默认代理即可，无需 `Upgrade` 头。

---

## 7. 数据库与备份清单

- **授权坑（最常见失败点）**：MariaDB 在远程，需确认用户 `Klinevargas` 允许来自**应用服务器出口 IP** 的连接（`GRANT ... TO 'Klinevargas'@'<app-server-ip>'`），且服务器防火墙/安全组放行到 3306。**不要只授权 localhost。**
- **迁移**：启动自动跑；也可显式 `pnpm --filter @jobhub/server migrate` 提前验证。
- **备份**：
  ```bash
  mysqldump -h 68.178.239.252 -u Klinevargas -p jobhub > jobhub-$(date +%F).sql
  ```
  也可经 `/export`（需 `X-API-Key`）导出 JSON 备份。
- **回收站 7 天自动清理**已内置（每 6h 物理清除未恢复的软删），无需手动维护。

---

## 8. 上线前 Checklist

- [ ] 服务器：Node ≥ 18.18、pnpm 9 已装
- [ ] 代码/产物就位：`pnpm install && pnpm build:deploy` 成功（看到 `server/public/index.html`）
- [ ] `server/.env` 生产值填好，重点核对 `NODE_ENV=production`、`JWT_SECRET`、`ADMIN_PASSWORD`、`DB_*`
- [ ] MariaDB 用户已授权**应用服务器 IP**，且 3306 放行
- [ ] 启动：`NODE_ENV=production node dist/index.js`（或 systemd/pm2/docker）
- [ ] 探针：`curl /health` → 200；`curl /ready` → `status:"ready"`（14/14 迁移）
- [ ] 浏览器登录 `admin` 成功，**立即修改密码**
- [ ] Nginx 已配 + HTTPS + `TRUST_PROXY=1`
- [ ] 进程托管已设开机自启（`systemctl enable` / `pm2 startup` / `restart: unless-stopped`）
- [ ] 定时 `mysqldump` 备份已挂（每日 + 保留 N 天）
- [ ] 防火墙只开放 443（与必要 22），3306 不对外

---

## 9. 验证与回滚

**冒烟验证（部署后必做）：**
```bash
curl -fsS http://127.0.0.1:3000/health            # → {"code":0,...}
curl -fsS http://127.0.0.1:3000/ready             # → status:"ready", appliedMigrations:14
# 登录拿 cookie
curl -c cookies.txt -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'   # → {"code":0,...}
curl -b cookies.txt http://127.0.0.1:3000/api/v1/apps?limit=1   # → 200 + 数据
```

**回滚：**
- 保留上一版 `server/dist` 与 `.env`；进程托管切回旧目录/镜像即可。
- 注意：当前迁移只增不改（无 down 迁移）。**新版本若含破坏性迁移，需先在备份库演练**再上线。
- 日志：systemd 看 `journalctl -u jobhub`；pm2 看 `pm2 logs jobhub`。

---

## 10. 安全要点

- `server/.env` 不入库、权限 `600`，属主非 root 运行（`User=jobhub`）。
- `JWT_SECRET` 强随机且**长期不变**；`ADMIN_PASSWORD` 强随机并首次登录后改掉。
- `TRUST_PROXY=1`（非 `true`），防止伪造客户端 IP 绕过白名单/限流。
- `JOBHUB_API_KEY` 按需开启，可配 `JOBHUB_API_KEY_ALLOW_IPS` 限制来源。
- 强制 HTTPS（HSTS 可选）；cookie 为 `httpOnly` + `SameSite=Lax`，`secure` 随 `isProd` 自动开启。
