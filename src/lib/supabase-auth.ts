import type { NextRequest } from 'next/server';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import type { ChaoxingRole, ChaoxingUserInfo } from '@/lib/chaoxing-client';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { AgentRole } from '@/domain/agent';

export interface SessionProfile {
  displayName: string;
  avatar: string;
}

export interface WorkspaceCapabilities {
  studentWorkspace: boolean;
  teacherWorkspace: boolean;
  teacherPractice: boolean;
}

export interface SessionUser {
  id: string;
  email: string | null;
  provider: string;
  appRole: AgentRole;
  capabilities: WorkspaceCapabilities;
  defaultWorkspace: 'student' | 'teacher';
  createdAt: string;
  lastSignInAt: string;
  chaoxing: ChaoxingUserInfo;
  profile: SessionProfile;
}

/**
 * 服务端鉴权结果：除归一化的用户身份外，附带一个携带用户 JWT 的低权限 Supabase 客户端。
 * 业务路由应直接用该客户端执行 RLS 约束下的数据操作，替代历史基于 cookie 的会话客户端。
 */
export interface AuthSession {
  user: SessionUser;
  supabase: SupabaseClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(sources: Array<Record<string, unknown>>, keys: string[]): string {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
  }
  return '';
}

function getStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function getRoles(source: Record<string, unknown>, key: string): ChaoxingRole[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ChaoxingRole[] => {
    const role = asRecord(item);
    const roleId = getString([role], ['roleId']);
    const roleName = getString([role], ['roleName']);
    return roleId || roleName ? [{ roleId, roleName }] : [];
  });
}

function resolveRole(app: Record<string, unknown>, chaoxing: Record<string, unknown>): AgentRole {
  const configured = getString([app], ['role']);
  if (configured === 'teacher') return 'teacher';
  void chaoxing;
  return 'student';
}

function isTeacherCapable(appRole: AgentRole): boolean {
  return appRole === 'teacher';
}

function normalizeUser(user: User): SessionUser {
  const userMetadata = asRecord(user.user_metadata);
  const appMetadata = asRecord(user.app_metadata);
  const chaoxing = asRecord(appMetadata.chaoxing);
  const app = asRecord(appMetadata.app);
  // 平台 OAuth 将真实姓名放在 user_metadata.realname、超星身份 cxid 放在 user_metadata.cxid；
  // 旧自研会话把这些塞在 app_metadata.chaoxing。两处都读，平台字段优先，保证向前兼容。
  const openid = getString([userMetadata, chaoxing], ['cxid', 'openid']);
  const uid = getString([userMetadata, chaoxing], ['uid']);
  const name = getString([userMetadata, chaoxing], ['loginName', 'name']);
  const displayName = getString([userMetadata, chaoxing], ['realname', 'displayName', 'name']);

  const appRole = resolveRole(app, chaoxing);
  const teacherCapable = isTeacherCapable(appRole);
  const capabilities: WorkspaceCapabilities = {
    studentWorkspace: true,
    teacherWorkspace: teacherCapable,
    teacherPractice: teacherCapable,
  };

  return {
    id: user.id,
    email: user.email ?? null,
    provider: getString([appMetadata, userMetadata], ['provider']) || (openid ? 'chaoxing' : 'demo'),
    appRole,
    capabilities,
    defaultWorkspace: appRole === 'teacher' ? 'teacher' : 'student',
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? '',
    chaoxing: {
      openid,
      uid,
      name,
      displayName,
      fid: getString([userMetadata, chaoxing], ['fid']),
      orgName: getString([userMetadata, chaoxing], ['orgName']),
      role: getRoles(chaoxing, 'role'),
      loginNames: getStringArray(chaoxing, 'loginNames'),
      majorName: getString([userMetadata, chaoxing], ['majorName']),
      gradeName: getString([userMetadata, chaoxing], ['gradeName']),
      className: getString([userMetadata, chaoxing], ['className']),
    },
    profile: {
      displayName: displayName || getString([userMetadata], ['full_name', 'display_name']) || name || uid || openid || '用户',
      avatar: getString([userMetadata], ['avatar_url', 'picture']),
    },
  };
}

/**
 * 服务端登录态校验（平台 OAuth 鉴权规范）：
 * - 前端请求携带 `Authorization: Bearer <token>`；
 * - OpenSandbox 剥离该头，平台 Nginx 在边界重命名为 `X-Sandbox-Authorization`；
 * - 后端 API Route 只能从 `x-sandbox-authorization` 头读取 token（`authorization` 头到达服务端时恒为空）。
 *
 * 校验通过后返回归一化用户身份 + 携带用户 JWT 的低权限 supabase 客户端。
 */
export async function getSessionUser(request: NextRequest): Promise<AuthSession | null> {
  const accessToken = request.headers.get('x-sandbox-authorization')?.replace(/^Bearer\s+/i, '');
  if (!accessToken) return null;
  try {
    const supabase = createSupabaseServer(accessToken);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    // [TEMP-DIAG] 诊断平台 OAuth 登录后 app_metadata 实际契约（定位教师身份判定来源），验证后移除
    console.error('[auth-diag] app_metadata=', JSON.stringify(data.user.app_metadata ?? null));
    console.error('[auth-diag] user_metadata=', JSON.stringify(data.user.user_metadata ?? null));
    return { user: normalizeUser(data.user), supabase };
  } catch {
    return null;
  }
}