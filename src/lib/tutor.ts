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
