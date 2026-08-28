'use client';

import {
  DEFAULT_CHAOXING_TASKFLOW_ID,
  DEFAULT_CHAOXING_TASKFLOW_TRIGGER,
  type ChaoxingTaskflowPayload,
} from '@/lib/chaoxing-taskflow-contract';

export const CHAOXING_AGENT_ORIGINS = [
  'https://robot.chaoxing.com',
  'https://robot1.chaoxing.com',
  'https://robot2.chaoxing.com',
  'https://robot-dev.chaoxing.com',
  'https://robot-lc.chaoxing.com',
  'https://robot-lc1.chaoxing.com',
  'https://robot-lc2.chaoxing.com',
] as const;

const TRUSTED_ORIGINS = new Set<string>(CHAOXING_AGENT_ORIGINS);

function trustedOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const origin = new URL(candidate).origin;
    return TRUSTED_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

export function resolveChaoxingParentOrigin(href: string, referrer: string, embedded: boolean): string | null {
  if (!embedded) return null;
  try {
    const botReferrer = new URL(href).searchParams.get('bot_referer');
    const fromQuery = trustedOrigin(botReferrer);
    if (fromQuery) return fromQuery;
  } catch {
    // 无效页面地址时继续尝试 referrer，不扩大可信域名范围。
  }
  return trustedOrigin(referrer);
}

export type ChaoxingTaskflowDispatchResult =
  | { state: 'dispatched'; detail: string }
  | { state: 'unavailable'; detail: string };

export async function dispatchChaoxingTaskflow(payload: ChaoxingTaskflowPayload): Promise<ChaoxingTaskflowDispatchResult> {
  const embedded = window.parent !== window;
  const targetOrigin = resolveChaoxingParentOrigin(window.location.href, document.referrer, embedded);
  if (!targetOrigin) {
    return { state: 'unavailable', detail: '当前页面不在受信任的超星智能体容器中，保留服务器同步队列。' };
  }

  const taskId = process.env.NEXT_PUBLIC_CHAOXING_TASKFLOW_ID?.trim() || DEFAULT_CHAOXING_TASKFLOW_ID;
  window.parent.postMessage({
    type: 'CXBOT:setWsExtraData',
    data: { taskId, chatModel: 'APP', taskInitParams: payload },
  }, targetOrigin);

  await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
  window.parent.postMessage({
    type: 'CXBOT:send',
    data: { text: DEFAULT_CHAOXING_TASKFLOW_TRIGGER, hidden: true },
  }, targetOrigin);

  return { state: 'dispatched', detail: '已向超星任务流发送同步请求，服务器队列仍保留可靠留痕。' };
}
