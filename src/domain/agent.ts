export type AgentRole = 'student' | 'teacher';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageKind =
  | 'question'
  | 'step_answer'
  | 'supplement'
  | 'image_answer'
  | 'image_upload'
  | 'navigation'
  | 'report_request'
  | 'feedback';

export type StepStatus = 'locked' | 'active' | 'passed' | 'teacher_review';
export type EvaluationDecision = 'pass' | 'revise' | 'teacher_review';

export interface EvidencePoint {
  rubricId: string;
  label: string;
  quote: string;
}

export interface FeedbackPoint {
  rubricId: string;
  label: string;
  guidance: string;
}

export interface DetailedFeedbackIssue {
  dimension: keyof DimensionScores;
  kind: 'missing' | 'incorrect' | 'ambiguous' | 'safety';
  title: string;
  evidence: {
    stepId: number;
    quote: string;
    attemptNo: number;
  };
  scenario: string;
  impact: string;
  causeBoundary: string;
  action: string;
  check: string;
}

export interface DimensionScores {
  knowledge: number;
  operation: number;
  decision: number;
  troubleshooting: number;
  analysis: number;
}

export interface TextEvaluation {
  schemaVersion: 'TextEvaluation.v2';
  decision: EvaluationDecision;
  confidence: number;
  coveredPoints: EvidencePoint[];
  missingPoints: FeedbackPoint[];
  incorrectPoints: FeedbackPoint[];
  ambiguousPhrases: FeedbackPoint[];
  safetyAlerts: FeedbackPoint[];
  questions: string[];
  studentFeedback: string;
  teacherSummary: string;
  scores: DimensionScores;
  requiresTeacherReview: boolean;
  knowledgeChunkIds: string[];
  detailedIssues: DetailedFeedbackIssue[];
}

export interface ExperimentStep {
  id: number;
  slug: string;
  title: string;
  shortTitle: string;
  context: string;
  goal: string;
  keyPoints: Array<{
    id: string;
    dimension: keyof DimensionScores;
    label: string;
    hints: [string, string, string];
  }>;
  gates: Array<{
    id: string;
    label: string;
    patterns: string[];
    guidance: string;
  }>;
  source: string;
}

export interface AgentMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  createdAt: string;
  stepId: number | null;
  evaluation?: TextEvaluation;
  mediaUrl?: string;
}

export interface StepProgress {
  stepId: number;
  status: StepStatus;
  attemptCount: number;
  finalSummary?: string;
}

export interface StudentSessionView {
  sessionId: string;
  studentName: string;
  currentStep: number;
  completed: boolean;
  steps: StepProgress[];
  messages: AgentMessage[];
}

export interface ApiError {
  code:
    | 'AUTH_REQUIRED'
    | 'FORBIDDEN'
    | 'STATE_INVALID'
    | 'VALIDATION_ERROR'
    | 'AI_OUTPUT_INVALID'
    | 'AI_TIMEOUT'
    | 'MEDIA_QUALITY_LOW'
    | 'RESOURCE_MISSING'
    | 'SYNC_DEFERRED';
  message: string;
  retryable: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: ApiError; requestId: string };
