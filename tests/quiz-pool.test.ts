import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestionText, pickRandomUnassigned } from '../src/lib/quiz-pool';

interface FakeQuestion {
  id: string;
  question_text: string;
}

/** 构造一个含 n 道题的题目池 */
function makePool(n: number): FakeQuestion[] {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i}`, question_text: `题目 ${i}` }));
}

test('normalizeQuestionText 去除空白与中英文标点并统一小写', () => {
  assert.equal(normalizeQuestionText('  SDS-PAGE 的原理是什么？ '), 'sds-page的原理是什么');
  assert.equal(normalizeQuestionText('ABC, def。'), 'abcdef');
  assert.equal(normalizeQuestionText('稀释倍数　是　多少？'), '稀释倍数是　多少'.replace(/\s/g, ''));
});

test('pickRandomUnassigned 排除已分配题目', () => {
  const pool = makePool(10);
  const assigned = new Set(['q0', 'q1', 'q2']);
  const picked = pickRandomUnassigned(pool, assigned, 5);
  assert.equal(picked.length, 5);
  for (const q of picked) {
    assert.ok(!assigned.has(q.id), `不应返回已分配题目 ${q.id}`);
  }
  // 返回的题目互不重复
  assert.equal(new Set(picked.map((q) => q.id)).size, picked.length);
});

test('pickRandomUnassigned 池子不足时返回所有可用题目', () => {
  const pool = makePool(6);
  const assigned = new Set(['q0', 'q1', 'q2']);
  const picked = pickRandomUnassigned(pool, assigned, 5);
  assert.equal(picked.length, 3); // 6 - 3 = 3 道可用
});

test('多轮分配重复率为 0（同一用户累积去重）', () => {
  const pool = makePool(60);
  const userCount = 1000;
  const roundsPerUser = 4;
  const batchSize = 5;

  let totalAssigned = 0;
  let duplicateCount = 0;

  for (let u = 0; u < userCount; u++) {
    const assigned = new Set<string>();
    for (let r = 0; r < roundsPerUser; r++) {
      const picked = pickRandomUnassigned(pool, assigned, batchSize);
      // 验证本轮返回的题目与历史不重复
      for (const q of picked) {
        if (assigned.has(q.id)) duplicateCount++;
        assigned.add(q.id);
      }
      totalAssigned += picked.length;
    }
    // 每个用户 4 轮 × 5 题 = 20 题，均来自 60 题池，不重复
    assert.equal(assigned.size, roundsPerUser * batchSize);
  }

  assert.equal(duplicateCount, 0, `检测到 ${duplicateCount} 次重复分配`);
  assert.equal(totalAssigned, userCount * roundsPerUser * batchSize);
});

test('pickRandomUnassigned 覆盖题目池全量（不越界、不丢题）', () => {
  const pool = makePool(60);
  const picked = pickRandomUnassigned(pool, new Set(), 60);
  assert.equal(picked.length, 60);
  assert.equal(new Set(picked.map((q) => q.id)).size, 60);
});
