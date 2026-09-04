import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { requireTeacherSessionScope } from '@/lib/services/teacher-scope';

export interface TeacherStudentRecord {
  session: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  experimentProfile: Record<string, unknown> | null;
  attempts: Array<Record<string, unknown>>;
  evaluations: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
}

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅授权教师可查看学生档案。', retryable: false }, undefined, 403);
  const sessionId = request.nextUrl.searchParams.get('sessionId')?.trim();
  if (!sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少学生会话编号。', retryable: false }, undefined, 400);
  try {
    const admin = getSupabaseAdminClient();
    const scopedSession = await requireTeacherSessionScope(admin, identity.user.id, sessionId);
    const [{ data: session, error: sessionError }, { data: profile, error: profileError }, { data: experimentProfile, error: experimentError }, { data: attempts, error: attemptError }, { data: reports, error: reportError }] = await Promise.all([
      admin.from('agent_sessions').select('id,user_id,class_id,current_step,completed_at,created_at,updated_at,classes(name,course_id)').eq('id', sessionId).single(),
      admin.from('profiles').select('id,display_name,student_no,major_name,grade_name,class_name').eq('id', scopedSession.user_id).maybeSingle(),
      admin.from('student_experiment_profiles').select('target_gene,sequence_source,accession,coding_sequence,cloning_strategy,design_snapshot,created_at,updated_at').eq('session_id', sessionId).maybeSingle(),
      admin.from('step_attempts').select('id,step_no,version_no,answer,submitted_at').eq('session_id', sessionId).order('submitted_at', { ascending: true }),
      admin.from('learning_reports').select('id,version,content,rendered_markdown,created_at').eq('session_id', sessionId).order('version', { ascending: false }),
    ]);
    for (const error of [sessionError, profileError, experimentError, attemptError, reportError]) if (error) throw error;
    const attemptRows = (attempts ?? []) as Array<Record<string, unknown>>;
    const attemptIds = attemptRows.map((row) => String(row.id));
    let evaluations: Array<Record<string, unknown>> = [];
    if (attemptIds.length) {
      const { data, error } = await admin.from('evaluations').select('id,attempt_id,decision,confidence,total_score,result,requires_teacher_review,created_at,teacher_reviews(id,decision,comment,teacher_id,created_at)').in('attempt_id', attemptIds).order('created_at', { ascending: true });
      if (error) throw error;
      evaluations = (data ?? []) as Array<Record<string, unknown>>;
    }
    const { data: timeline, error: timelineError } = await admin.from('agent_messages').select('id,role,kind,step_no,content,metadata,created_at').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(100);
    if (timelineError) throw timelineError;
    return ok<TeacherStudentRecord>({
      session: session as Record<string, unknown>, profile: profile as Record<string, unknown> | null,
      experimentProfile: experimentProfile as Record<string, unknown> | null, attempts: attemptRows,
      evaluations, reports: (reports ?? []) as Array<Record<string, unknown>>, timeline: (timeline ?? []) as Array<Record<string, unknown>>,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail({ code: 'FORBIDDEN', message: '该学生不在你的授权班级范围内。', retryable: false }, undefined, 403);
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
