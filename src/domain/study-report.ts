export interface StudyReportSectionsV2 {
  schemaVersion: 'StudyReport.v2';
  dataBasis: string[];
  dimensionDefinitions: Array<{ dimension: string; max: number; definition: string; scoringBasis: string }>;
  stepEvidence: Array<{ stepNo: number; evidence: string[] }>;
  strengths: string[];
  issues: Array<{ category: string; evidence: string; impact: string }>;
  causeBoundaries: string[];
  actionPlan: Array<{ action: string; appliesTo: string; check: string }>;
  gradeStatus: string;
  teacherReviewStatus: string;
}

export interface StudyReportV2 {
  schemaVersion: 'StudyReport.v2';
  markdown: string;
  sections: StudyReportSectionsV2;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

export function normalizeStudyReport(value: unknown): StudyReportV2 {
  const source = asRecord(value);
  const sections = asRecord(source.sections);
  const markdown = typeof source.markdown === 'string' ? source.markdown.trim() : '';
  if (!markdown) throw new Error('学习报告缺少 markdown 正文');
  return {
    schemaVersion: 'StudyReport.v2',
    markdown,
    sections: {
      schemaVersion: 'StudyReport.v2',
      dataBasis: strings(sections.dataBasis),
      dimensionDefinitions: Array.isArray(sections.dimensionDefinitions) ? sections.dimensionDefinitions as StudyReportSectionsV2['dimensionDefinitions'] : [],
      stepEvidence: Array.isArray(sections.stepEvidence) ? sections.stepEvidence as StudyReportSectionsV2['stepEvidence'] : [],
      strengths: strings(sections.strengths),
      issues: Array.isArray(sections.issues) ? sections.issues as StudyReportSectionsV2['issues'] : [],
      causeBoundaries: strings(sections.causeBoundaries),
      actionPlan: Array.isArray(sections.actionPlan) ? sections.actionPlan as StudyReportSectionsV2['actionPlan'] : [],
      gradeStatus: typeof sections.gradeStatus === 'string' ? sections.gradeStatus : '尚未认定',
      teacherReviewStatus: typeof sections.teacherReviewStatus === 'string' ? sections.teacherReviewStatus : '暂无教师复核',
    },
  };
}
