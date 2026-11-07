# AGENTS.md — JobHub 开发入口

适用范围：jobhub/ 及其子目录。

本项目完整协作规范位于 ../AGENTS.md。开始任何开发任务前必须读取该文件，并按任务阅读本目录 README.md、package.json 和相关源码。直接以 jobhub 为工作目录启动助手时也必须执行这一阅读步骤。

关键入口提醒：
- 本目录是实际应用，client 为 React/Vite，server 为 Fastify/Knex/MariaDB。
- 使用 pnpm，命令在本目录运行；pnpm dev 只启动后端，前端另运行 pnpm dev:client。
- pnpm typecheck 只覆盖服务端；前端通过 pnpm build:client 检查。
- API 和导入文档位于 ../docs/，产品与视觉规范位于父目录。
- 所有业务数据按 user_id 隔离；金额以整数分保存；状态变更与 app_events 同事务。
- 导入默认演练；真实写入、replace、清库、seed、迁移与部署须遵守父规范的授权和备份要求。
- 不在 server/public 或 dist 修改源码，不泄露 .env，不改动真实求职数据用于测试。

本文件仅提供启动入口，不复制完整规则；更新公共开发约定时维护 ../AGENTS.md，避免多份规范漂移。
