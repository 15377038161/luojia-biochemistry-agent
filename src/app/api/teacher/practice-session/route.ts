import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok, requestId } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { loadTeacherPracticeSessionView } from '@/lib/services/sessions';

/**
 * 教师体验会话。
 * 会话类型唯一判据为 agent_sessions.agent_role='teacher'（current_step 非空区分体验会话与分析会话）。
 * 教师体验数据不进入学生成绩、班级统计和学习通同步：
 * - 评价/报告走服务端直写路径（不写 sync_outbox）；
 * - 学生统计查询均显式限定 agent_role='student'。
 */
export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const id = requestId();
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, id, 401);
  if (!identity.user.capabilities.teacherPractice) {
    return fail({ code: 'FORBIDDEN', message: '当前身份没有教师学习体验权限。', retryable: false }, id, 403);
  }
  try {
    // step_states 无用户侧写策略，创建/恢复链路统一走 service-role 客户端，身份与范围已在上方校验。
    const supabase = getSupabaseAdminClient();
    const view = await loadTeacherPracticeSessionView(supabase, identity.user.id, identity.user.profile.displayName);
    return ok(view, id);
  } catch (error) {
    return fail(errorFromUnknown(error), id, 500);
  }
}
