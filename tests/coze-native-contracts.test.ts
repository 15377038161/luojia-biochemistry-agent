import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCourseGrade } from '../src/domain/grade';
import { defaultCourseContent, validateCourseContent } from '../src/domain/course-content';
import { normalizeStudyReport } from '../src/domain/study-report';

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
