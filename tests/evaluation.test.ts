import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDeterministicGates, normalizeEvaluation, totalScore } from '../src/domain/evaluation';
import { experimentSteps } from '../src/domain/experiment';
import { courseImageQuestions } from '../src/domain/media';
import type { TextEvaluation } from '../src/domain/agent';
import {
  backoffMinutes,
  buildChaoxingFormRequest,
  checkChaoxingFormHealth,
  getChaoxingFormConfig,
  getChaoxingFormConfigurationStatus,
  mapChaoxingFormFields,
} from '../src/lib/chaoxing-sync';
import { buildChaoxingReportTaskflowPayload, buildChaoxingTaskflowPayload } from '../src/lib/chaoxing-taskflow-contract';
import { resolveChaoxingParentOrigin } from '../src/lib/chaoxing-taskflow-client';
import { buildStepReviewRows, getStepLearningSummary } from '../src/lib/step-learning-report';

function evaluation(overrides: Partial<TextEvaluation> = {}): TextEvaluation {
  return {
    schemaVersion: 'TextEvaluation.v2', decision: 'pass', confidence: 0.9, coveredPoints: [], missingPoints: [], incorrectPoints: [], ambiguousPhrases: [], safetyAlerts: [], questions: [],
    studentFeedback: '可以进入下一步', teacherSummary: '已覆盖',
    scores: { knowledge: 20, operation: 30, decision: 20, troubleshooting: 15, analysis: 15 },
    requiresTeacherReview: false, knowledgeChunkIds: [], detailedIssues: [],
    strengths: ['要点覆盖完整'], reasoningReview: '推理完整。', standardAnswer: '参考答案。',
    improvedAnswer: '改写建议。', knowledgeExplanation: '知识讲解。', nextAction: '进入下一步。', ...overrides,
  };
}

test('八步内容连续且每步覆盖五维', () => {
  assert.deepEqual(experimentSteps.map((step) => step.id), [1,2,3,4,5,6,7,8]);
  for (const step of experimentSteps) {
    assert.equal(step.keyPoints.length, 5);
    assert.deepEqual(new Set(step.keyPoints.map((point) => point.dimension)), new Set(['knowledge','operation','decision','troubleshooting','analysis']));
  }
});

test('确定性Gate覆盖模型的通过结论', () => {
  const answer = '我觉得方向无所谓，接上就能表达。';
  const gates = detectDeterministicGates(2, answer);
  assert.equal(gates.length, 1);
  const result = normalizeEvaluation(2, answer, evaluation());
  assert.equal(result.decision, 'revise');
  assert.equal(result.safetyAlerts[0].rubricId, 's2-g1');
});

test('评分被限制在五维最大值内', () => {
  const result = normalizeEvaluation(1, '这是一段没有Gate的正常描述。', evaluation({ scores: { knowledge: 99, operation: 99, decision: 99, troubleshooting: 99, analysis: 99 } }));
  assert.equal(totalScore(result.scores), 100);
});

test('低置信评阅必须建议教师查看', () => {
  const result = normalizeEvaluation(1, '正常描述', evaluation({ confidence: 0.4 }));
  assert.equal(result.requiresTeacherReview, true);
});

test('本步报告逐项给出学生证据、改法和参考答案', () => {
  const step = experimentSteps[3];
  const result = evaluation({
    coveredPoints: [{ rubricId: step.keyPoints[0].id, label: step.keyPoints[0].label, quote: 'SDS使蛋白变性并统一电荷。' }],
    missingPoints: [{ rubricId: step.keyPoints[1].id, label: step.keyPoints[1].label, guidance: '补充低温、间歇超声与等量上样。' }],
  });
  const rows = buildStepReviewRows(step, result, { [step.keyPoints[1].id]: '我会进行超声破碎。' });
  assert.equal(rows.length, 5);
  assert.equal(rows[0].status, '讲清楚了');
  assert.match(rows[0].studentEvidence, /SDS使蛋白变性/);
  assert.equal(rows[1].status, '需要补充');
  assert.match(rows[1].feedback, /低温/);
  assert.match(rows[1].referenceAnswer, /上清和沉淀/);
  assert.match(getStepLearningSummary(step, result).title, /步骤 4/);
});

test('每一步都有一张来源明确的图片题', () => {
  assert.deepEqual(courseImageQuestions.map((item) => item.stepId), [1,2,3,4,5,6,7,8]);
  for (const item of courseImageQuestions) {
    assert.ok(item.imagePath.startsWith('/course-assets/'));
    assert.ok(item.source.includes('07 图片'));
  }
});

test('超星同步退避有上限', () => {
  assert.equal(backoffMinutes(1), 2);
  assert.equal(backoffMinutes(8), 256);
  assert.equal(backoffMinutes(20), 256);
});

test('超星表单3513491只发送约定字段', () => {
  assert.deepEqual(mapChaoxingFormFields({ student_id: 's1', total_score: 88, course_contribution: 8.8, secret: 'no' }), {
    student_id: 's1', total_score: 88,
  });
});

test('超星传输默认关闭且不误报已接通', () => {
  const config = getChaoxingFormConfig({});
  assert.equal(config.transport, 'disabled');
  assert.equal(getChaoxingFormConfigurationStatus({}).state, 'pending');
});

test('任务流与API共用幂等请求头并保留字段白名单', () => {
  const request = buildChaoxingFormRequest({ event_id: 'event-1', payload: { student_id: 's1', secret: 'drop' } }, {
    formId: '3513491', transport: 'taskflow', writeUrl: 'https://example.test/taskflow', token: 'token', readbackUrl: '', rateLimitPerSecond: 2,
  });
  assert.equal(request.headers['Idempotency-Key'], 'event-1');
  assert.equal(request.url, 'https://example.test/taskflow');
  assert.deepEqual(JSON.parse(request.body), { formId: '3513491', fields: { student_id: 's1' } });
});

test('超星回查健康检查只在回查接口成功时标记ready', async () => {
  const result = await checkChaoxingFormHealth({
    formId: '3513491', transport: 'api', writeUrl: 'https://example.test/write', token: 'token', readbackUrl: 'https://example.test/read', rateLimitPerSecond: 0,
  }, async (input, init) => {
    assert.equal(input, 'https://example.test/read');
    assert.equal(init?.method, 'GET');
    return new Response('{}', { status: 200 });
  });
  assert.equal(result.state, 'ready');
});

test('超星任务流载荷复用评阅幂等键并计算五维总分', () => {
  const payload = buildChaoxingTaskflowPayload({
    eventId: 'event-1', studentId: 'student-1', stepId: 4, versionNo: 2,
    studentAnswer: '这是一段用于契约测试的文字实验推演描述。', evaluation: evaluation(),
  });
  assert.equal(payload.event_id, 'event-1');
  assert.equal(payload.step_id, 4);
  assert.equal(payload.version_no, 2);
  assert.equal(payload.total_score, 100);
  assert.equal(payload.ai_confidence, 0.9);
  assert.equal(payload.teacher_comment, '');
});

test('网页桥接只接受超星智能体可信来源且拒绝顶层页面', () => {
  assert.equal(resolveChaoxingParentOrigin(
    'https://app.example.test/student?bot_referer=https%3A%2F%2Frobot.chaoxing.com%2Fchat', '', true,
  ), 'https://robot.chaoxing.com');
  assert.equal(resolveChaoxingParentOrigin('https://app.example.test/student', 'https://robot-lc1.chaoxing.com/chat', true), 'https://robot-lc1.chaoxing.com');
  assert.equal(resolveChaoxingParentOrigin('https://app.example.test/student?bot_referer=https%3A%2F%2Fevil.example', 'https://evil.example', true), null);
  assert.equal(resolveChaoxingParentOrigin('https://app.example.test/student', 'https://robot.chaoxing.com/chat', false), null);
});

test('学习报告任务流载荷会清空无关步骤字段', () => {
  const payload = buildChaoxingReportTaskflowPayload({ reportId: 'report-1', studentId: 'student-1', versionNo: 1, markdown: '# 测试报告' });
  assert.equal(payload.event_id, 'report:report-1');
  assert.equal(payload.final_report, '# 测试报告');
  assert.equal(payload.step_id, '');
  assert.equal(payload.student_answer, '');
  assert.equal(payload.total_score, '');
});
