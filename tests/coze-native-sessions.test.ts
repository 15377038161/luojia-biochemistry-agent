// Coze 原生会话契约测试：
// 1. 学生会话只查询 agent_role='student'
// 2. 教师体验只查询 agent_role='teacher'
// 3. current_step=null 时返回第 1 步（严禁默认第 8 步）
// 4. 教师体验评价记录不写入 sync_outbox（不进入学习通同步与学生成绩）
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCurrentStep } from '@/lib/services/sessions';
import {
  EXPERIMENT_ID,
  PRACTICE_CLASS_ID,
  findActiveStudentSession,
  findActiveTeacherPracticeSession,
  createTeacherPracticeSession,
} from '@/lib/services/sessions';
import { normalizeEvaluation } from '@/domain/evaluation';
import { fixtureEvaluation } from '@/lib/coze-workflows';
import { getExperimentStep } from '@/domain/experiment';
import { buildEvaluationResultEnvelope, recordTeacherPracticeEvaluation, TEXT_EVAL_PROMPT_VERSION } from '@/lib/services/evaluation-record';
import { createFakeSupabase, tableCalls, rpcCalls } from './helpers/fake-supabase';

test('normalizeStep 在 current_step 为 null/undefined/0/NaN 时归一到第 1 步', () => {
  assert.equal(normalizeCurrentStep(null), 1);
  assert.equal(normalizeCurrentStep(undefined), 1);
  assert.equal(normalizeCurrentStep(0), 1);
  assert.equal(normalizeCurrentStep(''), 1);
  assert.equal(normalizeCurrentStep(Number.NaN), 1);
  assert.equal(normalizeCurrentStep('3'), 3);
  assert.equal(normalizeCurrentStep(8), 8);
});

test('学生会话查询只限定 agent_role=student 且排除已完成会话', async () => {
  const { client, calls, pushResponse } = createFakeSupabase();
  pushResponse(null);
  await findActiveStudentSession(client as never, 'user-1');
  const sessionCalls = tableCalls(calls, 'agent_sessions');
  assert.equal(sessionCalls.length, 1);
  const filters = sessionCalls[0].filters;
  assert.ok(filters.some((item) => item.column === 'agent_role' && item.operator === 'eq' && item.value === 'student'), '必须显式限定 agent_role=student');
  assert.ok(filters.some((item) => item.column === 'user_id' && item.operator === 'eq' && item.value === 'user-1'));
  assert.ok(filters.some((item) => item.column === 'completed_at' && item.operator === 'is' && item.value === null));
  assert.ok(!filters.some((item) => item.column === 'session_mode'), '不得查询已删除的 session_mode 列');
});

test('教师体验恢复查询只限定 agent_role=teacher', async () => {
  const { client, calls, pushResponse } = createFakeSupabase();
  pushResponse(null);
  await findActiveTeacherPracticeSession(client as never, 'teacher-1');
  const sessionCalls = tableCalls(calls, 'agent_sessions');
  assert.equal(sessionCalls.length, 1);
  const filters = sessionCalls[0].filters;
  assert.ok(filters.some((item) => item.column === 'agent_role' && item.operator === 'eq' && item.value === 'teacher'), '必须显式限定 agent_role=teacher');
  assert.ok(filters.some((item) => item.column === 'user_id' && item.value === 'teacher-1'));
  assert.ok(filters.some((item) => item.column === 'completed_at' && item.operator === 'is' && item.value === null));
});

test('教师体验会话服务端原子创建：会话 + 8 条 step_states + system 消息', async () => {
  const { client, calls, pushResponse } = createFakeSupabase();
  pushResponse({ id: 'session-1', current_step: 1, completed_at: null, student_id: 'teacher-1' }); // insert agent_sessions
  pushResponse({ count: 8 }); // insert step_states
  pushResponse({ count: 1 }); // insert agent_messages
  const session = await createTeacherPracticeSession(client as never, 'teacher-1');
  assert.ok(session);
  assert.equal(Number(session.current_step), 1);

  const sessionInsert = tableCalls(calls, 'agent_sessions').find((call) => call.operation === 'insert');
  assert.ok(sessionInsert, '必须插入 agent_sessions');
  const insertPayload = sessionInsert.payload as Record<string, unknown>;
  assert.equal(insertPayload.agent_role, 'teacher');
  assert.equal(insertPayload.current_step, 1);
  assert.equal(insertPayload.class_id, PRACTICE_CLASS_ID);
  assert.equal(insertPayload.experiment_id, EXPERIMENT_ID);

  const stateInsert = tableCalls(calls, 'step_states').find((call) => call.operation === 'insert');
  assert.ok(stateInsert, '必须插入 step_states');
  const states = stateInsert.payload as Array<Record<string, unknown>>;
  assert.equal(states.length, 8, '必须创建 8 条 step_states');
  assert.ok(states.every((state) => state.session_id === 'session-1'));
  const first = states.find((state) => state.step_no === 1);
  assert.equal(first?.status, 'active', '第 1 步必须为 active');
  assert.ok(states.filter((state) => state.status === 'locked').length === 7);

  const messageInsert = tableCalls(calls, 'agent_messages').find((call) => call.operation === 'insert');
  assert.ok(messageInsert, '必须写入初始化 system 消息');
  const message = messageInsert.payload as Record<string, unknown>;
  assert.equal(message.role, 'system');
  assert.equal(message.kind, 'navigation');
});

test('教师体验评价记录不写入 sync_outbox，也不调用学生评价 RPC', async () => {
  const { client, calls, pushResponse } = createFakeSupabase();
  pushResponse(null); // idempotent attempt lookup（服务先做幂等检查）
  pushResponse({ id: 'session-1', current_step: 1, completed_at: null, agent_role: 'teacher', user_id: 'teacher-1' }); // session
  pushResponse({ attempt_count: 0 }); // step_state
  pushResponse({ id: 'attempt-1' }); // insert attempt
  pushResponse({ id: 'evaluation-1' }); // insert evaluation
  pushResponse({ count: 1 }); // update step_states
  pushResponse({ count: 1 }); // update agent_sessions
  pushResponse({ count: 1 }); // next step_state active
  pushResponse({ count: 1 }); // insert agent_messages

  const step = getExperimentStep(1);
  const evaluation = normalizeEvaluation(step.id, '测试回答', {
    ...fixtureEvaluation(step, '测试回答'),
    decision: 'pass',
    studentFeedback: '很好。',
    teacherSummary: '教师总结。',
  });
  const envelope = buildEvaluationResultEnvelope(step, evaluation, TEXT_EVAL_PROMPT_VERSION);
  const record = await recordTeacherPracticeEvaluation(client as never, {
    sessionId: 'session-1',
    userId: 'teacher-1',
    stepNo: 1,
    requestKey: 'request-1',
    answer: '测试回答',
    envelope,
    evaluation,
    workflowRunId: null,
  });
  assert.equal(record.decision, 'pass');
  assert.equal(record.currentStep, 2);

  assert.equal(tableCalls(calls, 'sync_outbox').length, 0, '教师体验数据不得进入学习通同步');
  assert.equal(rpcCalls(calls, 'record_text_evaluation').length, 0, '教师体验不得调用学生评价 RPC');
  assert.ok(tableCalls(calls, 'evaluations').some((call) => call.operation === 'insert'));
  assert.ok(tableCalls(calls, 'step_attempts').some((call) => call.operation === 'insert'));
});
