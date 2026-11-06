#!/usr/bin/env node
/**
 * JobHub 本地导入助手
 *
 * 把「豆包」按 docs/import-schema.md 整理出来的 JSON 导入数据库。
 * 默认只演练（dryRun），不会写库；确认无误后加 --write 才真正写入。
 *
 * 用法：
 *   node scripts/import-data.mjs <数据文件.json>                  # 演练，不写库
 *   node scripts/import-data.mjs <数据文件.json> --write          # 实写（会提示影响范围）
 *   node scripts/import-data.mjs <数据文件.json> --write --mode=replace   # 覆盖式导入
 *
 * 环境变量（可选）：
 *   BASE_URL   服务地址，默认 http://127.0.0.1:3000
 *   JOBHUB_API_KEY  不设则从 server/.env 读取
 *
 * 说明：
 * - 数据文件既可以是完整的 { mode, dryRun, data:{...} }，也可以只是 data 部分（会自动包装）。
 * - 演练返回 errors 非空时，脚本拒绝实写，并逐条打印出错位置。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const envPath = path.join(root, 'server', '.env');

const STAT_KEYS = [
  'profile', 'resumes', 'apps', 'appEvents', 'interviews', 'questions',
  'questionAnalyses', 'questionLinks', 'offers', 'weeklyReviews', 'checkins', 'roadmapTasks',
];
const LABEL = {
  profile: '求职定位', resumes: '简历', apps: '岗位', appEvents: '流转事件',
  interviews: '面试', questions: '题目', questionAnalyses: 'AI 分析',
  questionLinks: '题目关联', offers: 'Offer', weeklyReviews: '周复盘',
  checkins: '打卡', roadmapTasks: '路线图任务',
};

function readEnvFile() {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function fmtStats(obj) {
  if (!obj) return '无';
  const parts = STAT_KEYS.filter((k) => Number(obj[k] ?? 0) > 0).map(
    (k) => `${LABEL[k]} ${obj[k]}`,
  );
  return parts.length ? parts.join('、') : '无';
}

function usage() {
  console.log(`
JobHub 导入助手

  node scripts/import-data.mjs <数据文件.json>                 演练（默认，不写库）
  node scripts/import-data.mjs <数据文件.json> --write         实写
  node scripts/import-data.mjs <数据文件.json> --write --mode=replace   覆盖式导入

数据格式见 docs/import-schema.md；先跑演练确认 errors 为空，再加 --write。
`);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

const fileArg = args.find((a) => !a.startsWith('-'));
const wantWrite = args.includes('--write');
const modeArg = args.find((a) => a.startsWith('--mode='));

if (!fileArg) {
  console.error('缺少数据文件路径。');
  usage();
  process.exit(2);
}

const filePath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`文件不存在：${filePath}`);
  process.exit(2);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (e) {
  console.error(`JSON 解析失败：${e.message}`);
  process.exit(2);
}

const env = readEnvFile();
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const apiKey = process.env.JOBHUB_API_KEY || env.JOBHUB_API_KEY || '';
if (!apiKey) {
  console.error('未找到 JOBHUB_API_KEY：请设置环境变量，或在 server/.env 中配置。');
  process.exit(2);
}

// 兼容两种输入：完整请求体 / 纯 data
const body = raw && typeof raw === 'object' && raw.data ? { ...raw } : { data: raw };
body.mode = modeArg ? modeArg.split('=')[1] : body.mode || 'append';
body.dryRun = !wantWrite;

if (!['append', 'replace'].includes(body.mode)) {
  console.error(`mode 只能是 append 或 replace，收到：${body.mode}`);
  process.exit(2);
}

if (body.mode === 'replace') {
  console.log('⚠️  replace 模式会清空 11 张业务数据表（保留账号、路线图模板与任务）。');
  console.log('   如果想保留现有数据，请改用 --mode=append。\n');
}

async function callImport(payload) {
  const res = await fetch(`${baseUrl}/api/v1/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `服务返回的不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}` +
        '\n若为 HTML，通常是反向代理拦截（如 413 体积限制）。',
    );
  }
  return { status: res.status, json };
}

console.log(`服务：${baseUrl}`);
console.log(`文件：${filePath}`);
console.log(`模式：${body.mode}（${wantWrite ? '实写' : '演练，不写库'}）\n`);

let result;
try {
  result = await callImport(body);
} catch (e) {
  console.error(`请求失败：${e.message}`);
  process.exit(1);
}

const { status, json } = result;
const data = json.data || {};
const errors = data.errors || [];

if (status === 422 || errors.length > 0) {
  console.error(`❌ 校验未通过（HTTP ${status}），共 ${errors.length} 处，未写库：\n`);
  for (const err of errors.slice(0, 50)) {
    console.error(`  · ${err.path || '(根)'}：${err.message}`);
  }
  if (errors.length > 50) console.error(`  … 其余 ${errors.length - 50} 条省略`);
  console.error('\n请把上述位置反馈给豆包修正后重新导出。');
  process.exit(1);
}

console.log('✅ 演练通过' + (wantWrite ? '，已写入' : '（未写库）'));
console.log(`  新增：${fmtStats(data.created)}`);
console.log(`  更新：${fmtStats(data.updated)}`);
console.log(`  跳过：${fmtStats(data.skipped)}`);
if (data.cleared) {
  const cleared = Object.entries(data.cleared)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t} ${n}`)
    .join('、');
  console.log(`  清空：${cleared || '无'}`);
}
if (data.warnings?.length) {
  console.log(`  提示：${data.warnings.length} 条`);
  for (const w of data.warnings.slice(0, 10)) console.log(`    - ${w}`);
}

if (!wantWrite) {
  console.log('\n确认无误后，加 --write 再跑一次即可写入数据库。');
}
