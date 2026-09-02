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
  // 正式教师身份来源：服务端配置的 CHAOXING_TEACHER_ROLE_IDS 白名单。
  // 命中后写入 profiles.role / app_metadata.app.role；超星原始角色保存在
  // external_identities.raw_roles，班级范围权限由 enrollments + is_authorized_teacher 控制。
  // 不使用前端参数、URL 参数或客户端 role 判断，也不按 external_role_id 自动批量授权。
  const teacherGranted = hasConfiguredTeacherRole(returnedRoleIds, teacherRoleIds);
  const roleSource = teacherGranted ? 'chaoxing_role_id' : 'student_default';
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
    major_name: role === 'student' ? userInfo.majorName || null : null,
    grade_name: role === 'student' ? userInfo.gradeName || null : null,
    class_name: role === 'student' ? userInfo.className || null : null,
    academic_source: role === 'student' && (userInfo.majorName || userInfo.gradeName || userInfo.className)
      ? 'chaoxing_identity'
      : null,
  }, { onConflict: 'id' });
  if (profileError) throw new Error(`无法同步业务用户资料：${profileError.message}`);
  const { error: enrollmentError } = await admin.from('enrollments').upsert({
    class_id: '10000000-0000-4000-8000-000000000002',
    user_id: userId,
    role,
  }, { onConflict: 'class_id,user_id' });
  if (enrollmentError) throw new Error(`无法同步课程身份：${enrollmentError.message}`);
  const { error: identityError } = await admin.from('external_identities').upsert({
    user_id: userId,
    provider: 'chaoxing',
    external_uid: userInfo.uid,
    fid: userInfo.fid ?? null,
    raw_roles: userInfo.role.map((item) => ({ roleId: item.roleId ?? null, roleName: item.roleName ?? null })),
  }, { onConflict: 'provider,external_uid,fid' });
  if (identityError) throw new Error(`无法同步外部身份：${identityError.message}`);

  return link.properties.hashed_token;
}
