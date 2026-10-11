import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

/**
 * 运行模式判定语义，与 src/server.ts 保持一致：
 *   dev = process.env.NODE_ENV !== 'production'
 * 此处作为纯函数独立固化语义，用于回归验证，避免将来回退到 COZE_PROJECT_ENV 等非标准变量。
 */
function resolveDevMode(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}

test('运行模式判定：production → 非 dev（false）', () => {
  assert.equal(resolveDevMode('production'), false);
});

test('运行模式判定：development → dev（true）', () => {
  assert.equal(resolveDevMode('development'), true);
});

test('运行模式判定：未设置 → dev（true）', () => {
  assert.equal(resolveDevMode(undefined), true);
});

test('scripts/start.sh 显式声明 NODE_ENV=production', () => {
  assert.match(read('scripts/start.sh'), /NODE_ENV=production/);
});

test('scripts/dev.sh 显式声明 NODE_ENV=development', () => {
  assert.match(read('scripts/dev.sh'), /NODE_ENV=development/);
});

test('src/server.ts 用标准 NODE_ENV 判定，无 COZE_PROJECT_ENV 残留', () => {
  const src = read('src/server.ts');
  assert.match(src, /process\.env\.NODE_ENV !== 'production'/);
  assert.doesNotMatch(src, /COZE_PROJECT_ENV/);
});

test('src/app/layout.tsx 用标准 NODE_ENV 判定 isDev，无 COZE_PROJECT_ENV 残留', () => {
  const src = read('src/app/layout.tsx');
  assert.match(src, /process\.env\.NODE_ENV === 'development'/);
  assert.doesNotMatch(src, /COZE_PROJECT_ENV/);
});
