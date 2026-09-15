'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeacherAgent from '@/components/agent/teacher-agent';
import { getSupabase } from '@/lib/supabase';

type TeacherView = 'overview' | 'students' | 'student-detail' | 'reviews' | 'content' | 'content-detail';

interface Props {
  preview?: boolean;
  view?: TeacherView;
  contentStep?: number;
  studentSessionId?: string;
}

/**
 * 教师工作区路由入口（客户端权限托管）：
 * 登录态存于浏览器 localStorage，AuthGuard 已在根 layout 守护未登录访问（跳 /login），
 * 这里仅异步解析展示名后渲染业务聚合组件；教学工作台能力判断由数据接口的 403 语义保证。
 */
export default function TeacherRoutePage({ preview = false, view = 'overview', contentStep, studentSessionId }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(preview ? '陈思盈老师' : '教师');

  const resolveIdentity = useCallback(async () => {
    try {
      const { data } = await getSupabase().auth.getUser();
      if (!data.user) return;
      const m = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const realname = typeof m.realname === 'string' ? m.realname.trim() : '';
      setDisplayName(realname || (data.user.email?.split('@')[0]) || '教师');
    } catch {
      /* 会话解析失败时保留默认展示名，AuthGuard 会负责导航 */
    }
  }, []);

  useEffect(() => {
    if (!preview) void resolveIdentity();
  }, [preview, resolveIdentity]);

  useEffect(() => {
    if (preview) return;
    void getSupabase().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
  }, [preview, router]);

  return (
    <TeacherAgent
      displayName={displayName}
      demo={false}
      preview={preview}
      view={view}
      contentStep={contentStep}
      studentSessionId={studentSessionId}
    />
  );
}