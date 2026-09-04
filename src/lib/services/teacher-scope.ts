import type { SupabaseClient } from '@supabase/supabase-js';

export async function authorizedTeacherClassIds(admin: SupabaseClient, teacherId: string): Promise<string[]> {
  const { data, error } = await admin.from('enrollments')
    .select('class_id')
    .eq('user_id', teacherId)
    .in('role', ['teacher', 'content_admin']);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => String(row.class_id)).filter(Boolean))];
}

export async function requireTeacherSessionScope(admin: SupabaseClient, teacherId: string, sessionId: string) {
  const classIds = await authorizedTeacherClassIds(admin, teacherId);
  if (classIds.length === 0) throw new Error('FORBIDDEN');
  const { data, error } = await admin.from('agent_sessions')
    .select('id,user_id,class_id,agent_role')
    .eq('id', sessionId)
    .eq('agent_role', 'student')
    .in('class_id', classIds)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('FORBIDDEN');
  return data;
}

export async function requireTeacherEvaluationScope(admin: SupabaseClient, teacherId: string, evaluationId: string) {
  const { data, error } = await admin.from('evaluations')
    .select('id,step_attempts!inner(session_id)')
    .eq('id', evaluationId)
    .maybeSingle();
  if (error) throw error;
  const attempt = Array.isArray(data?.step_attempts) ? data.step_attempts[0] : data?.step_attempts;
  const sessionId = attempt && typeof attempt === 'object' && 'session_id' in attempt ? String(attempt.session_id) : '';
  if (!sessionId) throw new Error('FORBIDDEN');
  return requireTeacherSessionScope(admin, teacherId, sessionId);
}
