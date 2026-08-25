import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCourseGrade } from '../src/domain/grade';
import { defaultCourseContent, validateCourseContent } from '../src/domain/course-content';
import { normalizeStudyReport } from '../src/domain/study-report';
import { configuredTeacherRoleIds, hasConfiguredTeacherRole } from '../src/lib/supabase-chaoxing-user';

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
