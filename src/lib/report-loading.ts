/**
 * 学习报告加载的无副作用纯函数（前后端共用）。
 * - missingSteps：判断八步是否全部通过，未全通过时不应触发报告生成。
 * - elapsedText：把真实已等待时长格式化为中文秒数（不伪造进度/百分比）。
 *
 * 说明：后端不做「已有报告新鲜度」时间戳近似缓存复用——无法无 DDL 安全取得
 * 「评分事实 + 内容快照 + 教师复核」的完整 fingerprint，时间戳近似会掩盖教师复核
 * （record_teacher_review）与新评价。已有报告的读取由只读 GET 端点显式提供。
 */

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
