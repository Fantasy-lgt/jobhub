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
| `pnpm import:data <file.json>` | 导入豆包等整理好的 JSON：默认**演练不写库**，加 `--write` 才写入；`--mode=replace` 覆盖式导入 |
| `pnpm --filter @jobhub/server start` | 生产模式启动后端（`node dist/index.js`）；pnpm 会把 cwd 设为 `server/`，保证 `dotenv` 读到 `server/.env`。**勿从仓库根直接 `node server/dist/index.js`** |

## 部署（共享主机 cPanel · Phusion Passenger）

### 环境变量（由宿主注入，不随项目包上传）

- `.env` **不进版本库**（`jobhub/.gitignore` 已排除任意层级的 `.env`），也**不随项目包上传**；生产配置请在 cPanel「Setup Node.js App → Environment variables」逐条填写，或用 cPanel 文件管理器在 `server/.env` 单独创建。
- **`NODE_ENV=production` 必须由宿主 / cPanel 注入**。未注入时 `config.isProd=false`，登录写入的 httpOnly cookie 不会带 `Secure` 属性，生产 HTTPS 下鉴权行为不符合预期。`Secure` cookie **仅在 HTTPS 下回传**，所以发布前必须确认站点已启用 HTTPS；若以明文 HTTP 提供页面又注入了 `NODE_ENV=production`，会表现为「登录成功但随即跳登录」。
- 其余必需变量：`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `JWT_SECRET` / `ADMIN_PASSWORD` / `DEEPSEEK_API_KEY` 等，模板见 `.env.example`。`PORT` 留空由 Passenger 注入，`HOST` 设为 `127.0.0.1`。
- **`TRUST_PROXY`（反向代理场景必看）**：默认 `false`——不信任任何 `X-Forwarded-For`，应用只看直连 IP。部署在 Nginx / Apache / Passenger 之后时设为 **`1`**（或 `true`/`yes`/`on`，等价于一层），否则应用看到的客户端 IP 都是代理地址，会导致 `JOBHUB_API_KEY_ALLOW_IPS` 白名单失效（表现为正常来源也 403）、API Key 限流把所有人算成同一个 IP。多层代理填层数（`2`、`3`…）；填非数字无效值等同 `false`。
- **`JOBHUB_API_KEY` / `JOBHUB_API_KEY_ALLOW_IPS`**：外部程序接入用，见下文「外部程序接入」。
- **反向代理请求体上限**：`POST /api/v1/import` 单次上限 10 MB（其余接口 2 MB），代理层需同步 ≥ 10 MB（Nginx `client_max_body_size 10m;`、Apache `LimitRequestBody 10485760`），否则代理会先返回自己的 413 页面（非 `{code,data,message}` 结构）。

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
| 调 `POST /api/v1/import` 返回 **413** | 本服务的请求体上限是**按路由区分**的：`/import` **10 MB**、其余接口 **2 MB**。**先看响应体是不是 JSON**：若响应体是 HTML 错误页（不是 `{code,data,message}`），说明请求被前置 **Nginx / Apache / Passenger** 拦掉了，要改代理配置而不是查应用日志——Nginx `client_max_body_size 10m;`、Apache `LimitRequestBody 10485760`。若响应体是本服务的 JSON 包裹，则是数据本身超限，**分批导入**（如 `apps` 每 500 条一组），不要靠无限调大上限绕过 |

## 关键约定

- 响应统一 `{ code, data, message }`，`code=0` 成功；列表分页 20 条/页。
- 鉴权：JWT（HS256，7 天）写 httpOnly cookie；所有业务查询按 `user_id` 过滤，不写死 `user_id=1`。
- 金额一律 `INT`（单位分）；日期 `YYYY-MM-DD`；时间戳 UTC。
- MariaDB JSON 列不支持 DEFAULT，应用层显式写入（空 `[]`/`{}`；`self_scores` 可 `NULL`）。
- 统计单一事实源：概览/复盘/命中率/年包/弱点/streak 全部从源表实时计算，唯一例外是 `weekly_reviews.*_override`。
- 状态变更必须写 `app_events`（事务），时间轴不可手改。

## 外部程序接入（脚本 / AI 助手 / 第三方系统）

浏览器之外的调用方（运维脚本、批量导入、AI 助手、CI）推荐用 **`X-API-Key`** 鉴权，不必登录、不受 7 天会话过期影响。

### 1. Key 在哪配

- 配置项在 **`server/.env`**（生产由 cPanel 环境变量注入，见上文「部署」），模板见根 `.env.example`：

```dotenv
# 外部程序调用业务接口用的 API Key（留空 = 关闭该通道）
JOBHUB_API_KEY=<YOUR_API_KEY>
# 可选：限制 API Key 只允许来自这些 IP（逗号分隔，留空不限制）
JOBHUB_API_KEY_ALLOW_IPS=
```

- 生成方式（**不要手写弱口令**）：

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

- 修改后**必须重启应用**才生效（配置在启动时读取，无热更新）。

### 2. 怎么传给调用方

- 请求头：`X-API-Key: <YOUR_API_KEY>`，与 cookie / `Authorization: Bearer` 三者**任一**通过即视为已认证。
- 交付方式：通过密码管理器 / 内网密钥库 / 部署系统的 secret 变量传递，**不要**用聊天、邮件明文或写进仓库。
- 调用方示例（curl）：

```bash
curl -s http://127.0.0.1:3000/api/v1/apps?page=1&pageSize=20 \
  -H "X-API-Key: $JOBHUB_API_KEY"
```

> 说明：外部程序也可用 `X-API-Key` 直接调用 `GET /api/v1/export` 做全量备份（此前仅支持登录态）。完整接口与示例见 `docs/api-reference.md`，机器可读规范见 `docs/openapi.yaml`。

### 3. 轮换与吊销

| 动作 | 步骤 | 生效 |
|---|---|---|
| 轮换 | 生成新 Key → 写入 `server/.env` 的 `JOBHUB_API_KEY` → 重启应用 → 通知调用方换新 Key | 重启后**旧 Key 立即失效** |
| 吊销 | 把 `JOBHUB_API_KEY` **置空** → 重启应用 | 重启后 API Key 通道整体关闭，仅保留登录态 |
| 紧急处置 | 疑似泄露时立刻替换为新随机串并重启，再复核访问日志 | 同上 |

> 同一时间只支持**一个** Key，轮换存在切换窗口，请在维护窗口执行并提前通知调用方。

### 4. 安全建议

- **只在内网或 HTTPS 下使用**；明文 HTTP 传 Key 等于泄露。
- **不要把 Key 写进前端代码**（Vite 打包后等同于公开）；浏览器场景请走登录 + httpOnly cookie。
- 配 `JOBHUB_API_KEY_ALLOW_IPS` 做来源限制，并在网关层做限流（服务端当前未内置限流）。
- 建议 90 天轮换一次；人员变动或调用方下线时立即轮换。
- Key 与 `JWT_SECRET`、`DB_PASSWORD` 同级对待：不进版本库、不进日志、不进截图。

### 5. 相关文档

- 完整接口清单（含每个接口的参数表、请求/响应示例、错误码、curl 示例）：**`docs/api-reference.md`**
- 机器可读规范（OpenAPI 3.1，可导入 Postman / Apifox / Swagger UI）：**`docs/openapi.yaml`**
- 批量导入的数据字段定义与去重规则：**`docs/import-schema.md`**

## 导入数据（豆包等助手整理好的 JSON）

1. 把 `docs/import-schema.md` 整份发给助手，让它按规范产出导入 JSON；
2. 先演练，确认没有报错：

```bash
pnpm import:data ./我的投递记录.json          # 默认 dryRun，不写库
```

3. 确认「新增 / 更新 / 跳过」数字符合预期后，再实写：

```bash
pnpm import:data ./我的投递记录.json --write
```

4. 首次初始化、想覆盖旧数据时用 `--mode=replace`（会清空 11 张业务数据表，**保留账号、路线图阶段与任务**）：

```bash
pnpm import:data ./我的投递记录.json --write --mode=replace
```

脚本会读取 `server/.env` 里的 `JOBHUB_API_KEY`，默认连 `http://127.0.0.1:3000`（可用环境变量 `BASE_URL` 覆盖）。
演练返回 `errors` 非空时脚本会拒绝实写，并逐条打印出错位置——把这些位置反馈给助手修正后重新导出即可。

> 安全提示：`replace` 是物理删除，不可逆。执行前先用 `GET /api/v1/export`（支持登录态或 `X-API-Key`）或 `backups/` 留一份备份。

