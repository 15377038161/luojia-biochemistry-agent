export interface CourseGradeCalculation {
  processScore: number;
  contributionPoints: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 八步等权；没有有效最终 Gate 的步骤按 0 分，课程贡献上限 10 分。 */
export function calculateCourseGrade(stepScores: Array<number | null | undefined>): CourseGradeCalculation {
  const normalized = Array.from({ length: 8 }, (_, index) => {
    const value = stepScores[index];
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  });
  const processScore = round2(normalized.reduce((sum, value) => sum + value, 0) / 8);
  return { processScore, contributionPoints: round2(processScore * 0.1) };
}
