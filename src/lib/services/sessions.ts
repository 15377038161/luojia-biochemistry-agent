import type { SupabaseClient } from '@supabase/supabase-js';
import { loadStudentSessionView } from '@/lib/student-session';
import type { StudentSessionView } from '@/domain/agent';

export const EXPERIMENT_ID = '10000000-0000-4000-8000-000000000003';
export const PRACTICE_CLASS_ID = '10000000-0000-4000-8000-000000000002';
const STEP_COUNT = 8;

export interface SessionReference {
  id: string;
  current_step: number | null;
  completed_at: string | null;
}

/** 会话当前步骤归一：current_step 可能为 null（历史数据），一律归一到第 1 步，严禁默认第 8 步。 */
export function normalizeCurrentStep(value: unknown): number {
  return Number(value) || 1;
}

/**
 * 查找当前用户的未完成学生会话。
 * 会话类型以 agent_sessions.agent_role 为唯一判据（'student'），不读取任何 session_mode 列。
 */
export async function findActiveStudentSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionReference | null> {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('id,current_step,completed_at')
    .eq('user_id', userId)
    .eq('agent_role', 'student')
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * 查找当前用户未完成的教师体验会话。
 * 判据：agent_role='teacher' 且 current_step 非空（教师分析会话 current_step 恒为 null，天然排除）。
 */
export async function findActiveTeacherPracticeSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionReference | null> {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('id,current_step,completed_at')
    .eq('user_id', userId)
    .eq('agent_role', 'teacher')
    .not('current_step', 'is', null)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * 服务端原子创建教师体验会话（生产库无 start_or_resume_teacher_practice_session RPC）：
 * 1. agent_sessions（agent_role='teacher'，current_step=1）
 * 2. 8 条 step_states（第 1 步 active，其余 locked）
 * 3. 初始化 system 消息
 * 使用 service-role 客户端：step_states 在 RLS 中仅对会话相关方开放 select，无用户侧 insert 策略。
 */
export async function createTeacherPracticeSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionReference> {
  const { data: session, error: sessionError } = await supabase
    .from('agent_sessions')
    .insert({
      user_id: userId,
      student_id: userId,
      experiment_id: EXPERIMENT_ID,
      class_id: PRACTICE_CLASS_ID,
      agent_role: 'teacher',
      current_step: 1,
    })
    .select('id,current_step,completed_at')
    .single();
  if (sessionError) throw sessionError;

  const stepStates = Array.from({ length: STEP_COUNT }, (_, index) => ({
    session_id: session.id,
    step_no: index + 1,
    status: index === 0 ? ('active' as const) : ('locked' as const),
    attempt_count: 0,
  }));
  const { error: statesError } = await supabase.from('step_states').insert(stepStates);
  if (statesError) throw statesError;

  const { error: messageError } = await supabase.from('agent_messages').insert({
    session_id: session.id,
    role: 'system',
    kind: 'navigation',
    step_no: 1,
    content:
      '教师体验实验已开始。你将按学生八步推演流程完整体验本实验；体验数据仅用于教师自测，不计入学生成绩、班级统计和学习通同步。',
    metadata: { teacherPractice: true },
  });
  if (messageError) throw messageError;
  return session;
}

/** 恢复或创建教师体验会话，并渲染为与学生端一致的会话视图。 */
export async function loadTeacherPracticeSessionView(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<StudentSessionView> {
  const existing = await findActiveTeacherPracticeSession(supabase, userId);
  const session = existing ?? (await createTeacherPracticeSession(supabase, userId));
  return loadStudentSessionView(supabase, session, `${displayName}（教师体验）`);
}
