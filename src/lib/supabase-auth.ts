import type { User } from '@supabase/supabase-js';
import type { ChaoxingRole, ChaoxingUserInfo } from '@/lib/chaoxing-client';
import { createReadOnlySupabaseClient } from '@/lib/supabase-ssr';
import type { AgentRole } from '@/domain/agent';

interface CookieReader {
  getAll(): Array<{ name: string; value: string }>;
}

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

export interface SessionContext {
  user: SessionUser;
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

const TEST_ACCOUNT_FIDS = ['1385'];

function isTeacherCapable(appRole: AgentRole, chaoxing: Record<string, unknown>): boolean {
  if (appRole === 'teacher') return true;
  const fid = getString([chaoxing], ['fid']);
  return TEST_ACCOUNT_FIDS.includes(fid);
}

function normalizeUser(user: User): SessionUser {
  const userMetadata = asRecord(user.user_metadata);
  const appMetadata = asRecord(user.app_metadata);
  const chaoxing = asRecord(appMetadata.chaoxing);
  const app = asRecord(appMetadata.app);
  const uid = getString([chaoxing], ['uid']);
  const name = getString([chaoxing], ['name']);
  const openid = getString([chaoxing], ['openid']);

  const appRole = resolveRole(app, chaoxing);
  const teacherCapable = isTeacherCapable(appRole, chaoxing);
  const capabilities: WorkspaceCapabilities = {
    studentWorkspace: true,
    teacherWorkspace: teacherCapable,
    teacherPractice: teacherCapable,
  };

  return {
    id: user.id,
    email: user.email ?? null,
    provider: getString([appMetadata], ['provider']) || (openid ? 'chaoxing' : 'demo'),
    appRole,
    capabilities,
    defaultWorkspace: appRole === 'teacher' ? 'teacher' : 'student',
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? '',
    chaoxing: {
      openid,
      uid,
      name,
      displayName: getString([chaoxing], ['displayName']),
      fid: getString([chaoxing], ['fid']),
      orgName: getString([chaoxing], ['orgName']),
      role: getRoles(chaoxing, 'role'),
      loginNames: getStringArray(chaoxing, 'loginNames'),
    },
    profile: {
      displayName: getString([userMetadata], ['full_name', 'display_name']) || name || uid || openid || '用户',
      avatar: getString([userMetadata], ['avatar_url', 'picture']),
    },
  };
}

export async function getSessionUser(cookies: CookieReader): Promise<SessionContext | null> {
  try {
    const supabase = createReadOnlySupabaseClient(cookies);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { user: normalizeUser(data.user) };
  } catch {
    return null;
  }
}
