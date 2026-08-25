import { getSupabaseAdminClient } from '@/lib/supabase-client';
import type { AgentRole } from '@/domain/agent';

const DEMO_CLASS_ID = '10000000-0000-4000-8000-000000000002';

export async function createDemoLoginToken(role: AgentRole): Promise<string> {
  if (process.env.ENABLE_DEMO_ACCESS !== 'true') throw new Error('演示入口未启用');
  const admin = getSupabaseAdminClient();
  const email = `biochem-demo-${role}@demo.invalid`;
  const displayName = role === 'teacher' ? '演示教师' : '演示学生';
  const appRole = role === 'teacher' ? 'teacher' : 'student';
  const appMetadata = { provider: 'demo', app: { role } };
  const userMetadata = { full_name: displayName };

  const { data: created } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link.properties?.hashed_token || !link.user?.id) throw new Error(error?.message || '无法创建演示会话');
  const userId = created.user?.id || link.user.id;
  await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata, user_metadata: userMetadata });
  await admin.from('profiles').upsert({ id: userId, display_name: displayName, role: appRole }, { onConflict: 'id' });
  await admin.from('enrollments').upsert({ class_id: DEMO_CLASS_ID, user_id: userId, role: appRole }, { onConflict: 'class_id,user_id' });
  return link.properties.hashed_token;
}
