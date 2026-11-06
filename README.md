# JobHub · 个人求职工作台

把社招从「海投 + 焦虑 + 记不清进度」变成一条看得见、能复盘、能推进的漏斗。

- **前端**：Vite 5 + React 18 + TypeScript 5 + React Router 6 + TanStack Query 5 + Zustand 4（手绘风，纯 CSS）
- **后端**：Node.js + TypeScript + Fastify 4 + Knex 3 + mysql2 + zod 3
- **数据库**：MariaDB 10.11（库 `jobhub`，utf8mb4，InnoDB，14 张表）

## 目录结构

```
jobhub/
├── client/          # 前端（Vite + React）
├── server/          # 后端（Fastify，@fastify/static 托管前端 dist）
├── scripts/         # 部署脚本（prepare-public.mjs）
├── package.json     # pnpm workspace 根
└── pnpm-workspace.yaml
```

> 架构设计与验收基线见仓库根 `docs/system_design.md`。

## 本地启动

```bash
# 1. 安装依赖（需要 pnpm，可用 corepack enable 开启）
pnpm install

# 2. 配置环境变量（后端从 server/.env 读取；模板见根目录 .env.example）
cp .env.example server/.env
# 然后编辑 server/.env，填入 DB / JWT_SECRET / ADMIN_PASSWORD / DEEPSEEK_API_KEY

# 3. 启动后端（开发路径自动执行数据库迁移 + seed 默认用户）
pnpm dev:server        # http://127.0.0.1:3000，GET /health → 200

# 4. 另开终端启动前端（dev 代理 /api → 127.0.0.1:3000）
pnpm dev:client        # http://localhost:5173
```

> 启动错误分级：**连接类**错误 → `warn` 降级启动（进程仍 listen、只有 DB 操作报错）；**结构 / 权限 / DDL 类**错误 → `log.error` 并 `exit(1)` 拒绝启动（详见「故障排查」）。`GET /health` 是 liveness、恒返回 200（不查库），DB 是否就绪请以 `GET /ready` 为准（未就绪返回 503）。
>
> 端口约定：后端默认 `127.0.0.1:3000`、前端 Vite 默认 `5173`。若端口被同机其它项目占用，Vite 会自动顺延（以终端输出为准），后端请改 `PORT` 或先释放占用；**验证探针前务必确认该端口监听的确实是 JobHub Fastify**，不要把别的项目返回的 200/404 当成本项目结果。

## 健康检查探针

| 路径 | 类型 | 行为 | 用途 |
|---|---|---|---|
| `GET /health` | liveness（存活） | 无鉴权、恒 200，不查库 | 宿主 / Passenger 判断进程是否存活；**不能**作为可切流量的依据 |
| `GET /ready` | readiness（就绪） | 无鉴权，校验 14 张业务表 + 迁移版本（3s 超时即判未就绪）；通过 200，失败 **503** | 发布后切流量前必查；**503 表示不可切流量**，先排查 DB 连通性与迁移版本 |

**返回体（统一 `{ code, data, message }` 包裹）**

| 路径 | HTTP | `code` | `data` | `message` |
|---|---|---|---|---|
| `/health` | 恒 200 | `0` | `{ status:'ok', time }` | `ok` |
| `/ready` | 200 | `0` | `{ status:'ready', missingTables:[], appliedMigrations, requiredMigrations, time }` | `ready` |
| `/ready` | 503 | `503` | `{ status:'not_ready', missingTables:[...], appliedMigrations, requiredMigrations, time, error? }` | 「缺表 N 张，已应用迁移 X/14」 |

- `/ready` 通过条件：**14 张业务表齐全** 且 `appliedMigrations >= requiredMigrations`（当前为 14）。14 表：`users` / `profiles` / `resumes` / `apps` / `app_events` / `interviews` / `interview_questions` / `question_analyses` / `question_links` / `offers` / `weekly_reviews` / `roadmap_stages` / `roadmap_tasks` / `checkins`。
- **维护告警**：`requiredMigrations` 来自后端常量 `EXPECTED_MIGRATIONS`（当前 14，见 `db.ts`），`>=` 判定不会随迁移文件数自动抬高门槛。新增第 15 个迁移时须同步：①把该常量改为 15；②更新本文基线值与探针表「X/14」示例文案。`data.requiredMigrations` 与 503 `message` 均由常量模板派生（`app.ts` 用 `${appliedMigrations}/${requiredMigrations}`），**无需改 `app.ts`**。否则新库缺新迁移也可能被判就绪；发布前请核对 `data.appliedMigrations` 与迁移文件数。
- `missingTables` 直接列出缺失表名；DB 不可达时附 `error`（简短原因，**不含凭据**）。
- 切流量判断以 **HTTP 状态码** 为准（503 禁止切流量），`code` 字段与之一致；不要把 `/health`=200 当成可切流量依据。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm build` | 构建 server + client |
| `pnpm build:deploy` | `pnpm build` 后再执行 `node scripts/prepare-public.mjs`，把 `client/dist` 拷入 `server/public`（发布用；顺序固定：先编译、再拷贝） |
| `pnpm migrate` | **显式**执行数据库迁移（`knex migrate:latest`） |
| `pnpm seed` | 手动写入默认用户 + 5 阶段路线图（库已有联调数据，**发布无需执行**） |
| `pnpm typecheck` | 后端类型检查（tsc --noEmit） |
| `pnpm --filter @jobhub/server start` | 生产模式启动后端（`node dist/index.js`）；pnpm 会把 cwd 设为 `server/`，保证 `dotenv` 读到 `server/.env`。**勿从仓库根直接 `node server/dist/index.js`** |

## 部署（共享主机 cPanel · Phusion Passenger）

### 环境变量（由宿主注入，不随项目包上传）

- `.env` **不进版本库**（`jobhub/.gitignore` 已排除任意层级的 `.env`），也**不随项目包上传**；生产配置请在 cPanel「Setup Node.js App → Environment variables」逐条填写，或用 cPanel 文件管理器在 `server/.env` 单独创建。
- **`NODE_ENV=production` 必须由宿主 / cPanel 注入**。未注入时 `config.isProd=false`，登录写入的 httpOnly cookie 不会带 `Secure` 属性，生产 HTTPS 下鉴权行为不符合预期。`Secure` cookie **仅在 HTTPS 下回传**，所以发布前必须确认站点已启用 HTTPS；若以明文 HTTP 提供页面又注入了 `NODE_ENV=production`，会表现为「登录成功但随即跳登录」。
- 其余必需变量：`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `JWT_SECRET` / `ADMIN_PASSWORD` / `DEEPSEEK_API_KEY` 等，模板见 `.env.example`。`PORT` 留空由 Passenger 注入，`HOST` 设为 `127.0.0.1`。

### 发布步骤

1. **构建产物**：本地执行 `pnpm build:deploy`。脚本会清理 `server/public/` 旧内容，再把 `client/dist` 内容复制进去并输出文件数；缺 `client/dist/index.html` 时直接失败退出，不会产出半成品。
2. **数据库备份**：发布前用宿主 phpMyAdmin / `mysqldump` 对 `jobhub` 库做一次全量备份，记录备份文件名与时间。这是回滚的唯一数据兜底。
3. **显式迁移（不可省略）**：执行 `pnpm migrate`，确认无报错、迁移版本正确后再继续。**不要依赖启动时自动迁移做首发部署**——首发必须显式跑一次并确认成功，遵循「先迁移、后发布代码」；显式迁移成功后，启动时自动迁移仅为幂等兜底（重复执行无副作用，prod 启动日志 `[db] migrations up to date`）。prod 的 migrations 目录解析已由 `RuntimeMigrationSource` 按环境取 `.ts`/`.js` 修好。迁移均为向后兼容的加表 / 加列，如需回退优先只回退代码，数据用备份兜底。
4. **上传**：仅上传 `server/` 下运行必需的 `dist/`、`public/`、`migrations/`、`package.json` 等；`.env` 不随包上传。
5. **cPanel「Setup Node.js App」**：Application root = `server`，Application startup file = `dist/index.js`，Application mode = **Production**，Node.js 20 LTS。
6. **重启**：点「Restart App」。
7. **切流量前验证**：先确认站点已启用 HTTPS（`Secure` cookie 前提）；`GET /health` → 200（进程存活）；`GET /ready` → **200**（关键表 + 迁移版本就绪）后方可切流量。`/ready` 返回 503 时**禁止切流量**。
8. **冒烟**：登录 + 关键业务接口返回 200。

### 回滚

- **触发条件**：`/ready` 持续 503、登录失败、关键接口 5xx、迁移报错。
- **执行步骤**：① cPanel 切回上一版 `server/dist` + `server/public` 产物（或重传上一制品包）→ Restart App；② 若本次已执行迁移且必须回退数据，用步骤 2 的备份恢复（迁移向后兼容时通常只需回退代码）；③ 复验 `/ready` = 200 后再切流量。
- **制品留存**：每次发布保留上一版 `dist/`、`public/` 压缩包与对应 commit / 时间戳，保证可在一分钟内退回。

### 故障排查（启动与切流量）

| 现象 | 排查方向 |
|---|---|
| `/ready` 返回 503 | 按 `data.missingTables` 补建缺失表；`appliedMigrations < requiredMigrations` 时先跑 `pnpm migrate`；带 `error` 时查 DB 连通性 / IP 白名单 / 凭据；探针 3s 超时也会判 `not_ready` |
| 进程起不来、`/health` 也不通 | 结构 / 权限 / DDL 类启动错误会 `log.error` + `exit(1)` 拒绝 listen，看启动日志定位 |
| 进程能起但业务报错 | 连接类错误为 `warn` 降级启动，检查 DB 连通性；此状态 `/ready` 必为 503，禁止切流量 |
| production 启动即退出 | 缺 `JWT_SECRET` / `ADMIN_PASSWORD` 时在 `listen` 前 fail-fast（日志 `[config] 启动终止：JWT_SECRET 未配置...`）；补齐环境变量后重启。**另确认启动 cwd 为 `server/`**：`dotenv` 从 cwd 读 `.env`，从仓库根直接 `node server/dist/index.js` 会读不到 `server/.env` 而触发同一守卫；改用 `pnpm --filter @jobhub/server start` 或 `( cd server && node dist/index.js )`（cPanel 的 Application root = `server` 天然满足）。此现象易被误判成「服务被抢占」或「`/ready` 故障」，实为配置守卫按预期生效、**不是缺陷** |
| 登录 cookie 不带 `Secure` | 检查宿主是否注入 `NODE_ENV=production` |
| 登录成功但随即跳登录 | 多为「明文 HTTP + `NODE_ENV=production`」：`Secure` cookie 在 HTTP 下不回传。确认站点已启用 HTTPS 后重启并复登；**不要**靠去掉 `NODE_ENV` 绕过 |
| prod 迁移目录报错 | 已由 `RuntimeMigrationSource` 按环境加载 `.ts`/`.js`（对外 name 恒为 `.ts`、零 DB 写入、零新增迁移）；正常启动日志为 `[db] migrations up to date`，若异常先确认 `dist/migrations` 随包上传完整 |
| `/health` / `/ready` 返回非预期 404，或响应头带 `X-Powered-By: Express` | 请求打到了同机另一 Express 服务，说明 **JobHub 进程当前没在监听**（JobHub 是 Fastify，不发该头；常见原因是后台进程被终止，**不是端口冲突，也不是 `/ready` 或迁移实现故障**）。判据：`netstat -ano` 查 `:3000` 应能看到 JobHub 的 `127.0.0.1:3000 LISTENING` node 进程；若只有 `0.0.0.0:3000` / `[::]:3000` 通配监听，就是 JobHub 没起来，重新启动应用即可（Windows 下更具体的 `127.0.0.1` 绑定优先于通配地址，无需先释放那个 Express 或改 `PORT`）。启动后复验 `/ready`=200。**部署脚本 `prepare-public.mjs` 只做本地文件拷贝、不连任何端口，与此无关** |

## 关键约定

- 响应统一 `{ code, data, message }`，`code=0` 成功；列表分页 20 条/页。
- 鉴权：JWT（HS256，7 天）写 httpOnly cookie；所有业务查询按 `user_id` 过滤，不写死 `user_id=1`。
- 金额一律 `INT`（单位分）；日期 `YYYY-MM-DD`；时间戳 UTC。
- MariaDB JSON 列不支持 DEFAULT，应用层显式写入（空 `[]`/`{}`；`self_scores` 可 `NULL`）。
- 统计单一事实源：概览/复盘/命中率/年包/弱点/streak 全部从源表实时计算，唯一例外是 `weekly_reviews.*_override`。
- 状态变更必须写 `app_events`（事务），时间轴不可手改。
