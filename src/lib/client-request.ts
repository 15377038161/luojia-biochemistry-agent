'use client';

/**
 * 客户端统一错误文案。服务端返回的受控文案原样展示；
 * 网络层失败（fetch 被中断、WebView 报 Network Error/Failed to fetch 等）
 * 收敛为用户可操作的中文提示，避免把原始英文异常直接渲染到界面。
 */
export function clientErrorMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof Error)) return fallback;
  const text = `${reason.name} ${reason.message}`;
  if (
    /network|failed to fetch|load failed|connection|offline|aborted|aborterror|timed? ?out|econn[a-z]+|enotfound/i.test(text)
  ) {
    return '网络连接异常，请检查网络后重试。';
  }
  if (/(http\s*502|http\s*503|http\s*504|bad gateway|service unavailable|gateway timeout|upstream)/i.test(text)) {
    return '评阅服务暂时不可达，请稍后重试。';
  }
  if (/(syntaxerror|is not valid json|json\.parse|unexpected token)/i.test(text)) {
    return '评阅服务返回异常，请稍后重试。';
  }
  return reason.message || fallback;
}
