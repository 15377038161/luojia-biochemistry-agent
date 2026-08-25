import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const releaseRoot = path.resolve(root, 'release');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const archive = path.join(releaseRoot, `${packageJson.name}-${packageJson.version}-${stamp}.zip`);
const temporaryRoot = path.resolve(tmpdir());
const stage = path.join(temporaryRoot, `luojia-bundle-stage-${process.pid}`);

if (!stage.startsWith(`${temporaryRoot}${path.sep}`)) throw new Error('临时打包目录越出系统临时目录。');

const excludedDirectories = new Set(['node_modules', '.git', '.next', 'release', 'dist', 'output', '.playwright-cli', '.turbo', 'coverage']);
const excludedFiles = new Set(['tsconfig.tsbuildinfo', '.DS_Store']);

function include(source) {
  const relative = path.relative(root, source);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  if (parts.some((part) => excludedDirectories.has(part))) return false;
  const base = path.basename(source);
  if (excludedFiles.has(base) || base.endsWith('.log')) return false;
  if (base.startsWith('.env') && base !== '.env.example') return false;
  return true;
}

const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sql', '.css', '.html', '.txt', '.yml', '.yaml', '.sh', '.ps1', '.example']);
const secretPatterns = [
  { label: 'OpenAI/通用 sk 密钥', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'AWS Access Key', regex: /\bAKIA[A-Z0-9]{16}\b/g },
  { label: '疑似 JWT', regex: /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  { label: '私钥', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

try {
  await mkdir(releaseRoot, { recursive: true });
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(root, stage, { recursive: true, filter: include });

  const findings = [];
  for (const file of await walk(stage)) {
    const extension = path.extname(file).toLowerCase();
    if (!textExtensions.has(extension) && path.basename(file) !== '.env.example') continue;
    if ((await stat(file)).size > 2_000_000) continue;
    const content = await readFile(file, 'utf8');
    for (const pattern of secretPatterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content)) findings.push(`${pattern.label}: ${path.relative(stage, file)}`);
    }
  }
  if (findings.length) throw new Error(`密钥扫描失败：\n${findings.join('\n')}`);

  await rm(archive, { force: true });
  const packed = spawnSync('tar', ['-a', '-c', '-f', archive, '.'], { cwd: stage, encoding: 'utf8' });
  if (packed.status !== 0) throw new Error(`tar 打包失败：${packed.stderr || packed.stdout}`);
  const bytes = (await stat(archive)).size;
  console.log(`✅ 已生成：${archive} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log('✅ 密钥扫描通过；未包含 .env、本地依赖、Git历史、构建缓存或 release 旧产物。');
} finally {
  await rm(stage, { recursive: true, force: true });
}
