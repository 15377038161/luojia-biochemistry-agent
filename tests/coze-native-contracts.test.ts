import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCourseGrade } from '../src/domain/grade';
import { defaultCourseContent, validateCourseContent } from '../src/domain/course-content';
import { normalizeStudyReport } from '../src/domain/study-report';
import {
  buildCompactChaoxingClaims,
  configuredTeacherRoleIds,
  hasConfiguredTeacherRole,
} from '../src/lib/supabase-chaoxing-user';

test('学习通会话声明保持精简，学籍详情不重复写入JWT', () => {
  const claims = buildCompactChaoxingClaims({
    openid: 'openid-1',
    uid: 'uid-1',
    name: '20260001',
    displayName: '测试学生',
    fid: 'fid-1',
    orgName: '测试学校',
    role: [{ roleId: '3', roleName: '学生' }],
    loginNames: Array.from({ length: 50 }, (_, index) => `login-${index}`),
    majorName: '生物科学',
    gradeName: '2026级',
    className: '生科一班',
  }, 'student', 'student_default');

  assert.equal('loginNames' in claims.chaoxing, false);
  assert.equal('majorName' in claims.chaoxing, false);
  assert.equal('gradeName' in claims.chaoxing, false);
  assert.equal('className' in claims.chaoxing, false);
  assert.ok(JSON.stringify(claims).length < 1_500);
});

test('教师身份只使用稳定 roleId 白名单，不使用角色名称', () => {
  const configured = configuredTeacherRoleIds('7, 19,teacher-id');
  assert.equal(hasConfiguredTeacherRole(['19'], configured), true);
  assert.equal(hasConfiguredTeacherRole(['教师'], configured), false);
  assert.equal(hasConfiguredTeacherRole([], configured), false);
});

test('EGFP课程内容固定八步、重组克隆主线和五维Gate完整性', () => {
  const content = defaultCourseContent();
  assert.equal(content.targetProtein, 'EGFP');
  assert.equal(content.primaryStrategy, 'recombination');
  assert.equal(content.alternativeStrategy, 'double_digest');
  assert.deepEqual(validateCourseContent(content), { valid: true, errors: [] });
  const invalid = { ...content, steps: content.steps.slice(0, 7) };
  assert.equal(validateCourseContent(invalid).valid, false);
});

test('八步过程成绩等权，未完成步骤为0，课程贡献为10%', () => {
  assert.deepEqual(calculateCourseGrade([80, 80, 80, 80, 80, 80, 80, 80]), { processScore: 80, contributionPoints: 8 });
  assert.deepEqual(calculateCourseGrade([100, 100, 100, 100]), { processScore: 50, contributionPoints: 5 });
});

test('StudyReport V1式松散输出统一归一化为V2', () => {
  const report = normalizeStudyReport({ markdown: '## 学习结论\n仅基于文字证据。', sections: { dataBasis: ['Gate 1'] } });
  assert.equal(report.schemaVersion, 'StudyReport.v2');
  assert.equal(report.sections.schemaVersion, 'StudyReport.v2');
  assert.deepEqual(report.sections.dataBasis, ['Gate 1']);
  assert.equal(report.sections.gradeStatus, '尚未认定');
});
