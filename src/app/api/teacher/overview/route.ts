import { NextRequest } from 'next/server';
import { experimentSteps } from '@/domain/experiment';
import type { DimensionScores } from '@/domain/agent';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

interface RawSession {
  id: string;
  current_step: number | null;
  completed_at: string | null;
  profiles: Array<{ display_name: string | null; student_no: string | null }> | { display_name: string | null; student_no: string | null } | null;
}

interface RawAttempt {
  step_no: number;
  answer: string;
  version_no: number;
  session_id: string;
}

interface RawEvaluation {
  id: string;
  decision: 'pass' | 'revise' | 'teacher_review';
  confidence: number | string | null;
  total_score: number | string | null;
  result: unknown;
  requires_teacher_review: boolean;
  created_at: string;
  step_attempts: RawAttempt | RawAttempt[] | null;
  teacher_reviews: { id: string; decision: string; comment: string }[] | null;
}

export interface TeacherGateStatus {
  stepNo: number;
  status: 'passed' | 'current' | 'locked';
  decision?: 'pass' | 'revise' | 'teacher_review';
  totalScore?: number;
  requiresReview?: boolean;
  reviewed?: boolean;
}

export interface TeacherStudentDetail {
  stepNo: number;
  evaluationId: string;
  decision: 'pass' | 'revise' | 'teacher_review';
  totalScore: number | null;
  scores: DimensionScores | null;
  missingPoints: string[];
  studentFeedback: string;
  attempts: Array<{ versionNo: number; answer: string }>;
  reviewed: boolean;
}

export interface TeacherStudentOverview {
  sessionId: string;
  name: string;
  studentNo: string;
  currentStep: number;
  completed: boolean;
  gates: TeacherGateStatus[];
  detail: TeacherStudentDetail | null;
}

export interface TeacherOverview {
  totalStudents: number;
  pendingReviews: number;
  weakestGate: { stepNo: number; count: number } | null;
  students: TeacherStudentOverview[];
}

function profileOf(session: RawSession): { display_name: string | null; student_no: string | null } | null {
  if (!session.profiles) return null;
  return Array.isArray(session.profiles) ? session.profiles[0] || null : session.profiles;
}

function dimensionScores(result: unknown): DimensionScores | null {
  const scores = (result as { scores?: Partial<DimensionScores> } | null)?.scores;
  if (!scores) return null;
  const keys: Array<keyof DimensionScores> = ['knowledge', 'operation', 'decision', 'troubleshooting', 'analysis'];
  if (keys.some((key) => typeof scores[key] !== 'number')) return null;
  return {
    knowledge: scores.knowledge as number,
    operation: scores.operation as number,
    decision: scores.decision as number,
    troubleshooting: scores.troubleshooting as number,
    analysis: scores.analysis as number,
  };
}

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '只有教师可以查看班级数据。', retryable: false }, undefined, 403);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const [{ data: sessions, error: sessionError }, { data: evaluationRows, error: evaluationError }] = await Promise.all([
      supabase.from('agent_sessions')
        .select('id,current_step,completed_at,profiles!agent_sessions_user_id_fkey(display_name,student_no)')
        .eq('agent_role', 'student'),
      supabase.from('evaluations')
        .select('id,decision,confidence,total_score,result,requires_teacher_review,created_at,teacher_reviews(id,decision,comment),step_attempts!inner(step_no,answer,version_no,session_id)')
        .order('created_at', { ascending: true }),
    ]);
    if (sessionError) throw sessionError;
    if (evaluationError) throw evaluationError;

    const stepCount = experimentSteps.length;
    const evaluationsBySession = new Map<string, RawEvaluation[]>();
    for (const row of (evaluationRows || []) as RawEvaluation[]) {
      const attempt = Array.isArray(row.step_attempts) ? row.step_attempts[0] : row.step_attempts;
      if (!attempt) continue;
      const list = evaluationsBySession.get(attempt.session_id) || [];
      row.step_attempts = attempt;
      list.push(row);
      evaluationsBySession.set(attempt.session_id, list);
    }

    const students: TeacherStudentOverview[] = ((sessions || []) as RawSession[]).map((session) => {
      const currentStep = Math.min(Math.max(Number(session.current_step) || 1, 1), stepCount);
      const completed = Boolean(session.completed_at);
      const evaluations = evaluationsBySession.get(session.id) || [];
      const latestByStep = new Map<number, RawEvaluation>();
      for (const item of evaluations) {
        const attempt = item.step_attempts as RawAttempt;
        latestByStep.set(attempt.step_no, item);
      }
      const gates: TeacherGateStatus[] = Array.from({ length: stepCount }, (_, index) => {
        const stepNo = index + 1;
        const evaluation = latestByStep.get(stepNo);
        const status: TeacherGateStatus['status'] = completed || currentStep > stepNo ? 'passed' : currentStep === stepNo ? 'current' : 'locked';
        const gate: TeacherGateStatus = { stepNo, status };
        if (evaluation) {
          gate.decision = evaluation.decision;
          const score = Number(evaluation.total_score);
          gate.totalScore = Number.isFinite(score) ? score : undefined;
          gate.requiresReview = evaluation.requires_teacher_review;
          gate.reviewed = (evaluation.teacher_reviews?.length || 0) > 0;
        }
        return gate;
      });

      const lastEvaluation = evaluations[evaluations.length - 1] || null;
      let detail: TeacherStudentDetail | null = null;
      if (lastEvaluation) {
        const attempt = lastEvaluation.step_attempts as RawAttempt;
        const result = lastEvaluation.result as { missingPoints?: Array<{ label?: string }>; studentFeedback?: string; scores?: Partial<DimensionScores> } | null;
        const score = Number(lastEvaluation.total_score);
        detail = {
          stepNo: attempt.step_no,
          evaluationId: lastEvaluation.id,
          decision: lastEvaluation.decision,
          totalScore: Number.isFinite(score) ? score : null,
          scores: dimensionScores(lastEvaluation.result),
          missingPoints: (result?.missingPoints || []).map((point) => point.label || '').filter(Boolean),
          studentFeedback: result?.studentFeedback || '',
          attempts: evaluations
            .filter((item) => (item.step_attempts as RawAttempt).step_no === attempt.step_no)
            .map((item) => ({ versionNo: (item.step_attempts as RawAttempt).version_no, answer: (item.step_attempts as RawAttempt).answer })),
          reviewed: (lastEvaluation.teacher_reviews?.length || 0) > 0,
        };
      }
      return {
        sessionId: session.id,
        name: profileOf(session)?.display_name || '未命名学生',
        studentNo: profileOf(session)?.student_no || '',
        currentStep,
        completed,
        gates,
        detail,
      };
    }).sort((a, b) => (b.completed ? 1 : 0) - (a.completed ? 1 : 0) || b.currentStep - a.currentStep);

    const pendingReviews = ((evaluationRows || []) as RawEvaluation[]).filter((row) => row.requires_teacher_review && !(row.teacher_reviews?.length)).length;
    const reviseCounts = new Map<number, number>();
    for (const student of students) {
      for (const gate of student.gates) {
        if (gate.decision === 'revise') reviseCounts.set(gate.stepNo, (reviseCounts.get(gate.stepNo) || 0) + 1);
      }
    }
    let weakestGate: TeacherOverview['weakestGate'] = null;
    for (const [stepNo, count] of reviseCounts) {
      if (!weakestGate || count > weakestGate.count) weakestGate = { stepNo, count };
    }

    return ok<TeacherOverview>({ totalStudents: students.length, pendingReviews, weakestGate, students });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
