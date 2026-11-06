#!/usr/bin/env node
/**
 * 发布产物准备：把 client/dist 的内容复制到 server/public。
 * 仅使用 Node 原生 fs，不引入任何新依赖。
 * 用法：pnpm build:deploy（先 pnpm build 编译，再执行本脚本）
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const src = join(root, 'client', 'dist');
const dest = join(root, 'server', 'public');

// 1. 源产物必须存在且完整（缺 index.html 视为构建未完成，直接失败，避免上传半成品）
if (!existsSync(src)) {
  console.error(`[prepare-public] 源目录不存在：${src}`);
  console.error('[prepare-public] 请先执行 pnpm build（或 pnpm build:client）。');
  process.exit(1);
}
if (!existsSync(join(src, 'index.html'))) {
  console.error(`[prepare-public] 源目录缺少 index.html：${src}`);
  console.error('[prepare-public] 构建可能未完成，已中止，不清理 server/public。');
  process.exit(1);
}

// 2. 目标目录不存在则创建；存在则先清空旧内容（保留目录本身）
mkdirSync(dest, { recursive: true });
let removed = 0;
for (const entry of readdirSync(dest)) {
  rmSync(join(dest, entry), { recursive: true, force: true });
  removed += 1;
}

// 3. 逐顶层条目复制，语义明确：src 下的每个条目放到 dest 下同名位置
for (const entry of readdirSync(src)) {
  cpSync(join(src, entry), join(dest, entry), { recursive: true });
}

// 4. 统计并输出结果
function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    total += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return total;
}

console.log(`[prepare-public] 已清理 ${removed} 个旧条目`);
console.log(`[prepare-public] ${src} -> ${dest}`);
console.log(`[prepare-public] 完成，共 ${countFiles(dest)} 个文件`);
