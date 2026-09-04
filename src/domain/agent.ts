export type AgentRole = 'student' | 'teacher';
export type GradeStatus = 'provisional' | 'review_required' | 'appealed' | 'final';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageKind =
  | 'question'
  | 'step_answer'
  | 'supplement'
  | 'image_answer'
  | 'image_upload'
  | 'navigation'
  | 'report_request'
  | 'feedback'
  | 'content_snapshot'
  | 'grade_review_request'
  | 'grade_review_resolution';

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
  strengths: string[];
  reasoningReview: string;
  standardAnswer: string;
  improvedAnswer: string;
  knowledgeExplanation: string;
  nextAction: string;
}

export interface ExperimentStep {
  id: number;
  slug: string;
  title: string;
  shortTitle: string;
  context: string;
  goal: string;
  principle: string;
  sopParameters: string[];
  safetyNotes: string[];
  decisionTree: string[];
  instruments: string[];
  scientificPractice: string;
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
    | 'DB_ERROR'
    | 'AI_OUTPUT_INVALID'
    | 'AI_TIMEOUT'
    | 'NETWORK_ERROR'
    | 'MEDIA_QUALITY_LOW'
    | 'RESOURCE_MISSING'
    | 'SYNC_DEFERRED';
  message: string;
  retryable?: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: ApiError; requestId: string };
