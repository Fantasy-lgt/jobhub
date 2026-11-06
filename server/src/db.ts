import fs from 'fs';
import path from 'path';
import knex, { Knex } from 'knex';
import { config } from './config';

/**
 * 迁移/种子目录解析：开发（tsx src/index.ts）与生产（node dist/index.js）路径不同。
 * - 开发：server/migrations（.ts，经 tsx 加载）
 * - 生产：server/dist/migrations（.js，编译产物）
 */
function resolveDataDirs(): { migrationsDir: string; seedsDir: string; extension: string } {
  const compiledMigrations = path.join(__dirname, 'migrations'); // dist/migrations
  const compiledSeeds = path.join(__dirname, 'seeds'); // dist/seeds
  const sourceMigrations = path.join(__dirname, '..', 'migrations'); // server/migrations
  const sourceSeeds = path.join(__dirname, '..', 'seeds'); // server/seeds

  if (fs.existsSync(compiledMigrations)) {
    return { migrationsDir: compiledMigrations, seedsDir: compiledSeeds, extension: 'js' };
  }
  return { migrationsDir: sourceMigrations, seedsDir: sourceSeeds, extension: 'ts' };
}

const { migrationsDir, seedsDir, extension } = resolveDataDirs();

/** 迁移目录（供 knexfile 与运行时复用） */
export const migrationDir = migrationsDir;
export const seedDir = seedsDir;
export const migrationExtension = extension;

/**
 * 迁移记录名称统一规范成 `.ts` 后缀。
 *
 * 背景：现有库里 knex_migrations 已记录 14 条 `2026..._xxx.ts`（dev 用 tsx 跑的）。
 * 生产只加载 dist/migrations/*.js，若直接按文件名比对，knex 会判定
 * 「迁移目录损坏 / 14 个迁移全部未执行」，进而重复 CREATE TABLE。
 * 这里用自定义 migrationSource：文件名按运行环境取 .ts/.js，
 * 但对外报告的 name 恒为 `.ts`，dev 与 prod 共用同一套迁移账本，零 DB 写入。
 */
const CANONICAL_MIGRATION_EXTENSION = '.ts';

interface RuntimeMigrationSpec {
  file: string;
  directory: string;
  name: string;
}

class RuntimeMigrationSource implements Knex.MigrationSource<RuntimeMigrationSpec> {
  constructor(private readonly directory: string) {}

  async getMigrations(loadExtensions: readonly string[]): Promise<RuntimeMigrationSpec[]> {
    const files = await fs.promises.readdir(this.directory);
    return files
      .filter((file) => loadExtensions.includes(path.extname(file)))
      .sort()
      .map((file) => ({
        file,
        directory: this.directory,
        name: `${path.basename(file, path.extname(file))}${CANONICAL_MIGRATION_EXTENSION}`,
      }));
  }

  getMigrationName(migration: RuntimeMigrationSpec): string {
    return migration.name;
  }

  async getMigration(migration: RuntimeMigrationSpec): Promise<Knex.Migration> {
    // dev(.ts) 由 tsx 的 require hook 加载；prod(.js) 走原生 require
    const loaded = require(path.join(migration.directory, migration.file)) as
      | Knex.Migration
      | { default: Knex.Migration };
    return 'default' in loaded && loaded.default ? loaded.default : (loaded as Knex.Migration);
  }
}

/**
 * Knex 单例（mysql2 driver）。
 * pool.min=0：数据库连不上时服务仍可启动，只有执行 DB 操作时才报错。
 *
 * 关键：migrations/seeds 显式把「目录 + 扩展名」传给 knex 实例本身，
 * 不再依赖 knex 从 cwd 猜测默认目录。生产 `node dist/index.js` 时
 * cwd 可能是项目根，默认目录会指向 .ts 源码或找不到 dist/migrations/*.js。
 */
export const db: Knex = knex({
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    // DECIMAL 列以 number 返回（bonus_months / fund_rate 精度 ≤2 位，double 足够）
    decimalNumbers: true,
    // 仅 DATE 列以字符串返回（'YYYY-MM-DD'，修复 D-15/D-16 的 Date 对象崩溃）；
    // TIMESTAMP/DATETIME 保持 mysql2 默认 Date 对象 → JSON 序列化为 ISO 带 Z，前端 new Date() 无时区歧义
    // 注：knex 类型把 dateStrings 声明成 boolean，但 mysql2 实际支持 string[]，此处断言绕过类型检查
    dateStrings: ['DATE'] as unknown as boolean,
    // TINYINT(1) → boolean（与前端契约 / zod z.boolean() 对齐）；其余字段走 mysql2 默认 typeCast
    typeCast: (field: { type: string; length: number; string: () => string | null }, next: () => unknown) => {
      if (field.type === 'TINY' && field.length === 1) {
        const v = field.string();
        return v === null ? null : v === '1';
      }
      return next();
    },
    // 部分共享主机要求 SSL；按需开启
    ...(config.db.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    // 离线时快速失败，避免启动/请求长时间卡住
    connectTimeout: 5000,
  },
  pool: {
    min: 0,
    max: 5,
    acquireTimeoutMillis: 8000,
  },
  migrations: {
    directory: migrationsDir,
    extension,
    loadExtensions: [`.${extension}`],
  },
  seeds: {
    directory: seedsDir,
    extension,
    loadExtensions: [`.${extension}`],
  },
});

/** 运行时迁移源：dev/prod 都由它统一报告 `.ts` 名称，兼容现有迁移账本。 */
export const runtimeMigrationSource = new RuntimeMigrationSource(
  migrationsDir,
) as Knex.MigrationSource<unknown>;

/**
 * 执行迁移。
 * knex 的 Migrator 构造时会把 client.config.migrations 当作「调用参数」，
 * 一旦含 directory/loadExtensions 就会重置 migrationSource，
 * 因此这里在 latest() 时显式注入自定义迁移源，且不传任何 FS 相关参数。
 */
export function runMigrations(): Promise<unknown> {
  return db.migrate.latest({ migrationSource: runtimeMigrationSource });
}

/** 数据库连通性探测（带超时，供 /health 使用；仅作信息展示，不再是就绪判据）。 */
export async function checkDb(timeoutMs = 3000): Promise<boolean> {
  try {
    await Promise.race([
      db.raw('SELECT 1'),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('db check timeout')), timeoutMs);
        timer.unref?.();
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** 14 张业务表 + 迁移基线（与 migrations/ 下 14 个文件对应）。 */
export const REQUIRED_BUSINESS_TABLES: readonly string[] = [
  'users',
  'profiles',
  'resumes',
  'apps',
  'app_events',
  'interviews',
  'interview_questions',
  'question_analyses',
  'question_links',
  'offers',
  'weekly_reviews',
  'roadmap_stages',
  'roadmap_tasks',
  'checkins',
];

export const EXPECTED_MIGRATIONS = 14;

export interface ReadinessResult {
  ready: boolean;
  missingTables: string[];
  appliedMigrations: number;
  requiredMigrations: number;
  /** DB 不可达等异常时的简要原因（不含凭据）。 */
  error?: string;
}

/** 带超时的 Promise 包装，避免就绪探针把请求挂死。 */
async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('readiness check timeout')), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function inspectSchema(): Promise<ReadinessResult> {
  const placeholders = REQUIRED_BUSINESS_TABLES.map(() => '?').join(', ');
  const [tableRows] = (await db.raw(
    `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [config.db.database, ...REQUIRED_BUSINESS_TABLES],
  )) as [Array<{ table_name: string }>, unknown];

  const present = new Set(
    (tableRows ?? []).map((row) => String(row.table_name).toLowerCase()),
  );
  const missingTables = REQUIRED_BUSINESS_TABLES.filter((name) => !present.has(name));

  let appliedMigrations = 0;
  try {
    const [countRows] = (await db.raw('SELECT COUNT(*) AS c FROM `knex_migrations`')) as [
      Array<{ c: number | string }>,
      unknown,
    ];
    appliedMigrations = Number(countRows?.[0]?.c ?? 0);
  } catch {
    // knex_migrations 不存在：视为 0，由 ready 判定给出明确信号
    appliedMigrations = 0;
  }

  return {
    ready: missingTables.length === 0 && appliedMigrations >= EXPECTED_MIGRATIONS,
    missingTables,
    appliedMigrations,
    requiredMigrations: EXPECTED_MIGRATIONS,
  };
}

/** 就绪探针：14 张业务表齐全 + 迁移基线已应用；DB 不可达时明确返回 not_ready。 */
export async function checkReadiness(timeoutMs = 3000): Promise<ReadinessResult> {
  try {
    return await withTimeout(inspectSchema(), timeoutMs);
  } catch (err) {
    return {
      ready: false,
      missingTables: [...REQUIRED_BUSINESS_TABLES],
      appliedMigrations: 0,
      requiredMigrations: EXPECTED_MIGRATIONS,
      error: (err as Error).message,
    };
  }
}

/** JSON 列显式序列化（MariaDB JSON 列不支持 DEFAULT，应用层写入）。 */
export function toJson(value: unknown, empty: '[]' | '{}' | null = null): string | null {
  if (value === null || value === undefined) {
    return empty === null ? null : empty;
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
