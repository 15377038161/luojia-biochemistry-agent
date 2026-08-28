import type { TextEvaluation } from '@/domain/agent';
import { totalScore } from '@/domain/evaluation';

export const DEFAULT_CHAOXING_TASKFLOW_ID = '153154';
export const DEFAULT_CHAOXING_TASKFLOW_TRIGGER = '写入生物实验评价记录';

export interface ChaoxingTaskflowPayload {
  event_id: string;
  student_id: string;
  step_id: number | '';
  version_no: number | '';
  student_answer: string;
  ai_feedback: string;
  gate_status: TextEvaluation['decision'] | '';
  total_score: number | '';
  ai_confidence: number | '';
  teacher_comment: string;
  final_report: string;
}

export interface BuildChaoxingTaskflowPayloadInput {
  eventId: string;
  studentId: string;
  stepId: number;
  versionNo: number;
  studentAnswer: string;
  evaluation: TextEvaluation;
}

export function buildChaoxingTaskflowPayload(input: BuildChaoxingTaskflowPayloadInput): ChaoxingTaskflowPayload {
  return {
    event_id: input.eventId,
    student_id: input.studentId,
    step_id: input.stepId,
    version_no: input.versionNo,
    student_answer: input.studentAnswer,
    ai_feedback: input.evaluation.studentFeedback,
    gate_status: input.evaluation.decision,
    total_score: totalScore(input.evaluation.scores),
    ai_confidence: input.evaluation.confidence,
    teacher_comment: '',
    final_report: '',
  };
}

export function buildChaoxingReportTaskflowPayload(input: {
  reportId: string;
  studentId: string;
  versionNo: number;
  markdown: string;
}): ChaoxingTaskflowPayload {
  return {
    event_id: `report:${input.reportId}`,
    student_id: input.studentId,
    step_id: '',
    version_no: input.versionNo,
    student_answer: '',
    ai_feedback: '',
    gate_status: '',
    total_score: '',
    ai_confidence: '',
    teacher_comment: '',
    final_report: input.markdown,
  };
}
