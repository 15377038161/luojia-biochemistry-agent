/**
 * 学习报告加载/生成的无副作用纯函数（前后端共用）。
 * - isReportFresh：判断「已有学习报告」是否仍新鲜，用于避免重复付费生成。
 * - missingSteps：判断八步是否全部通过，未全通过时不应触发报告生成。
 * - elapsedText：把真实已等待时长格式化为中文秒数（不伪造进度/百分比）。
 *
 * 说明：新鲜度依据「报告创建时间 vs 评分事实最新时间」做时间戳近似，
 * 属于无 DDL 可安全实现的最小边界；不感知 teacher_reviews 表（教师复核走独立
 * grade 流程），也不提供跨实例并发幂等（见文档）。前端在超时后重试查询时会依赖
 * 后端「新鲜则复用、不新鲜才重新生成」，从而避免盲目重复付费。
 */

export interface ReportFreshness {
  /** 最近一份学习报告的创建时间（ISO 字符串，可为 null 表示尚无报告）。 */
  reportCreatedAt: string | null;
  /** 所有评阅记录中最新创建时间（可为 null 表示尚无评阅）。 */
  maxEvaluationCreatedAt: string | null;
  /** 所有步骤通过时间中最新值（可为 null 表示尚无通过步骤）。 */
  maxStepPassedAt: string | null;
}

function parseTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 报告是否仍新鲜：存在报告，且报告生成时间不早于任何评分事实（评阅/步骤通过）的
 * 最新时间。任一评分事实晚于报告，即视为「有更新的评价」，报告不再新鲜，需重新生成。
 */
export function isReportFresh(freshness: ReportFreshness): boolean {
  const reportTime = parseTime(freshness.reportCreatedAt);
  if (reportTime === null) return false;
  const factTimes = [parseTime(freshness.maxEvaluationCreatedAt), parseTime(freshness.maxStepPassedAt)].filter(
    (time): time is number => time !== null,
  );
  return factTimes.every((time) => time <= reportTime);
}

/**
 * 计算尚未通过的步骤编号列表。stepIds 为全部步骤编号，passedStepNos 为已通过步骤编号。
 * 返回非空数组表示「八步未全部通过」，此时不应调用报告生成（后端据此返回明确提示）。
 */
export function missingSteps(stepIds: number[], passedStepNos: number[]): number[] {
  const passed = new Set(passedStepNos);
  return stepIds.filter((id) => !passed.has(id));
}

/**
 * 把从 startMs 起真实流逝的时长格式化为中文秒数（向下取整，最小 0 秒）。
 * 仅用于「正在生成 · 已等待 N 秒」的真实反馈，不伪造阶段完成度。
 */
export function elapsedText(startMs: number, nowMs: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  return `${seconds} 秒`;
}
