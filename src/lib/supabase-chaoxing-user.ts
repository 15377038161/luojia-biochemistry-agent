import { createHash } from 'crypto';
import type { ChaoxingIdentity } from '@/lib/chaoxing-client';
import { getSupabaseAdminClient } from '@/lib/supabase-client';

const LEGACY_APP_METADATA_KEYS = {
  chaoxing_openid: null,
  chaoxing_uid: null,
  chaoxing_fid: null,
  chaoxing_login_name: null,
  chaoxing_org_name: null,
  chaoxing_login_names: null,
  chaoxing_roles: null,
};

function virtualEmail(openid: string): string {
  const subjectHash = createHash('sha256').update(openid).digest('hex').slice(0, 48);
  return `chaoxing_${subjectHash}@oauth.invalid`;
}

export function configuredTeacherRoleIds(raw = process.env.CHAOXING_TEACHER_ROLE_IDS ?? ''): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function hasConfiguredTeacherRole(returnedRoleIds: string[], configuredIds: Set<string>): boolean {
  return returnedRoleIds.some((roleId) => configuredIds.has(roleId));
}

/** 将可信超星身份映射到Supabase用户，并同步双智能体业务角色。 */
export async function createSupabaseLoginToken(identity: ChaoxingIdentity): Promise<string> {
  const admin = getSupabaseAdminClient();
  const { avatar, ...userInfo } = identity;
  const email = virtualEmail(userInfo.openid);
  const teacherRoleIds = configuredTeacherRoleIds();
  const returnedRoleIds = userInfo.role.map((item) => item.roleId).filter(Boolean);
  let teacherGranted = hasConfiguredTeacherRole(returnedRoleIds, teacherRoleIds);
  let roleSource = teacherGranted ? 'chaoxing_role_id' : 'student_default';

  if (!teacherGranted && returnedRoleIds.length > 0) {
    const { data: grant, error: grantError } = await admin
      .from('teacher_role_grants')
      .select('id')
      .eq('provider', 'chaoxing')
      .eq('fid', userInfo.fid)
      .eq('active', true)
      .in('external_role_id', returnedRoleIds)
      .limit(1)
      .maybeSingle();
    if (grantError) {
      console.warn('教师角色授权表暂不可用，将只使用 CHAOXING_TEACHER_ROLE_IDS：', grantError.message);
    } else if (grant) {
      teacherGranted = true;
      roleSource = 'teacher_role_grant';
    }
  }

  const role = teacherGranted ? 'teacher' : 'student';
  // 只记录 roleId 与最终授权来源，roleName 仅供排查显示，不参与权限判断。
  const rawRoles = userInfo.role.map((item) => `${item.roleId || '无ID'}:${item.roleName || '未命名'}`).join('、') || '（空）';
  console.info(
    `[角色判定] ${userInfo.displayName || userInfo.uid} uid=${userInfo.uid} fid=${userInfo.fid} 超星角色=[${rawRoles}] → ${role} (${roleSource})`,
  );
  const userMetadata = { preferred_username: null, full_name: userInfo.displayName, avatar_url: avatar };
  const appMetadata = {
    ...LEGACY_APP_METADATA_KEYS,
    provider: 'chaoxing',
    app: { role, roleSource },
    chaoxing: userInfo,
  };

  const { data: created } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !link.properties?.hashed_token || !link.user?.id) {
    throw new Error(`无法为超星用户生成Supabase登录凭据：${linkError?.message || '未知错误'}`);
  }
  const userId = created.user?.id || link.user.id;
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...link.user.app_metadata, ...appMetadata },
    user_metadata: { ...link.user.user_metadata, ...userMetadata },
  });
  if (updateError) throw new Error(`无法同步超星用户资料：${updateError.message}`);

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    display_name: userInfo.displayName || userInfo.name || userInfo.uid,
    role,
    student_no: role === 'student' ? userInfo.name : null,
  }, { onConflict: 'id' });
  if (profileError) throw new Error(`无法同步业务用户资料：${profileError.message}`);
  const { error: enrollmentError } = await admin.from('enrollments').upsert({
    class_id: '10000000-0000-4000-8000-000000000002',
    user_id: userId,
    role,
  }, { onConflict: 'class_id,user_id' });
  if (enrollmentError) throw new Error(`无法同步课程身份：${enrollmentError.message}`);

  return link.properties.hashed_token;
}
