import test from 'node:test';
import assert from 'node:assert/strict';
import { publicQuizSession, validateQuizAnswers, type QuizSession } from '@/lib/quiz-contract';

const questions = [{ question_id: 'q1', question_text: '测试题', options: [{ id: 'A', text: '选项A' }, { id: 'B', text: '选项B' }], correct_option_id: 'A', explanation: '尚未提交的秘密解析' }];
const result = { question_id: 'q1', user_answer: 'B', correct_answer: 'A', is_correct: false, explanation: '已批改解析' };
for (const status of ['in_progress', 'submitted', 'graded'] as const) {
  test(status + ' 只在已批改状态输出结果，题干永远使用白名单', () => {
    const data = publicQuizSession({ id: 's1', questions, answers: { q1: 'B' }, results: [result], status });
    assert.equal('correct_option_id' in data.questions[0], false);
    assert.equal('explanation' in data.questions[0], false);
    assert.equal(JSON.stringify(data).includes('尚未提交的秘密解析'), false);
    assert.deepEqual(data.answers, { q1: 'B' });
    assert.deepEqual(data.results, status === 'graded' ? [result] : null);
  });
}
test('部分草稿合法，最终提交必须完整，伪造题号与选项被拒绝', () => {
  assert.equal(validateQuizAnswers(questions, {}), true);
  assert.equal(validateQuizAnswers(questions, {}, true), false);
  assert.equal(validateQuizAnswers(questions, { q1: 'B' }, true), true);
  for (const value of [null, [], { q1: 'E' }, { q2: 'A' }, { q1: { answer: 'A' } }]) assert.equal(validateQuizAnswers(questions, value), false);
});
test('已批改答卷序列化可重新进入且保留题目、选项与成绩', () => {
  const original = publicQuizSession({ id: 's1', questions, answers: { q1: 'B' }, status: 'graded', results: [result] });
  const restored = JSON.parse(JSON.stringify(original)) as QuizSession;
  assert.equal(restored.status, 'graded');
  assert.deepEqual(restored.questions, original.questions);
  assert.deepEqual(restored.results, original.results);
});
