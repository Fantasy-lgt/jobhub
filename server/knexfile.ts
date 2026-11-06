import path from 'path';
import type { Knex } from 'knex';
import { config } from './src/config';

/**
 * Knex CLI 配置文件（`pnpm migrate` / `pnpm seed` 使用）。
 * 生产环境由 index.ts 启动时自动执行 migrate + seed，此处主要供本地手动操作。
 */
const baseConfig: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    decimalNumbers: true,
    dateStrings: ['DATE'],
    // TINYINT(1) → boolean，与 db.ts 保持一致
    typeCast: (field, next) => {
      if (field.type === 'TINY' && field.length === 1) {
        return field.string() === '1';
      }
      return next();
    },
    ...(config.db.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
    extension: 'ts',
  },
};

const knexfile: Record<string, Knex.Config> = {
  development: baseConfig,
  production: baseConfig,
  test: baseConfig,
};

export default knexfile;
module.exports = knexfile;
