/**
 * API 运行开关：默认走真实后端接口（生产构建 / .env 未配置时同样如此）。
 *
 * 只有显式设置 VITE_USE_MOCK=true 才启用骨架期遗留的本地假数据分支，
 * 避免「环境变量没配就静默跑 mock」把假数据当成真实结果。
 * 旧分支保留是为了离线演示，不逐个删除（改动面大且易回归）。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
