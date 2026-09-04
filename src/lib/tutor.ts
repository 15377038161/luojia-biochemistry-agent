// AI 助教可见性/可用性统一规则：前端渲染与接口拒绝共用同一来源，
// 保证"答题期间前后端同时禁用"不会出现口径漂移。
import { ApiError } from '@/domain/agent';

export type TutorLearningStage = 'task' | 'simulation' | 'quiz' | 'review';

// 步骤工作台阶段：0 步骤说明 / 1 知识检验 / 2 文字推演 / 3 点评报告。
// 知识检验与文字推演作答期间必须隐藏并禁用 AI 助教。
export const TUTOR_ALLOWED_WORKSTATION_STAGES: readonly number[] = [0, 3];

export function isTutorAllowedWorkstationStage(stage: number): boolean {
  return TUTOR_ALLOWED_WORKSTATION_STAGES.includes(stage);
}

export function assertTutorStage(stage: unknown): TutorLearningStage {
  if (stage !== 'task' && stage !== 'simulation' && stage !== 'quiz' && stage !== 'review') {
    const error: ApiError = { code: 'VALIDATION_ERROR', message: '缺少学习阶段参数。', retryable: false };
    throw error;
  }
  if (stage === 'quiz' || stage === 'simulation') {
    const error: ApiError = {
      code: 'STATE_INVALID',
      message: '知识检验和文字推演期间 AI 助教暂停，提交后可继续提问。',
      retryable: false,
    };
    throw error;
  }
  return stage;
}

export function isPeerDataRequest(question: string): boolean {
  const normalized = question.replace(/\s+/g, '');
  const peer = /(其他人|其他学生|其他同学|别人|别的同学|同班同学|全班|班里|某同学|同学们)/;
  const privateData = /(答案|作答|回答|分数|成绩|得分|进度|完成情况|答完|提交情况|报告|排名)/;
  return peer.test(normalized) && privateData.test(normalized);
}

export const PEER_DATA_PRIVACY_REPLY = '我只能访问你的当前实验会话和课程公共资料，不能查看、比较或推测其他学生的答案、成绩、进度或学习报告。你可以问我你的本步反馈、课程原理或如何改进自己的作答。';
