'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentAgent from '@/components/agent/student-agent';
import { getSupabase } from '@/lib/supabase';

interface Props {
  preview?: boolean;
  stepId?: number;
  reportPage?: boolean;
}

/**
 * 学生工作区路由入口（客户端权限托管）：
 * 登录态存于浏览器 localStorage，AuthGuard 已在根 layout 守护未登录访问（跳 /login），
 * 这里仅异步解析展示名（realname → email 前缀）后渲染业务聚合组件。
 */
export default function StudentRoutePage({ preview = false, stepId, reportPage = false }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(preview ? '陈同学' : '学生');

  const resolveIdentity = useCallback(async () => {
    try {
      const { data } = await getSupabase().auth.getUser();
      if (!data.user) return;
      const m = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const realname = typeof m.realname === 'string' ? m.realname.trim() : '';
      setDisplayName(realname || (data.user.email?.split('@')[0]) || '学生');
    } catch {
      /* 会话解析失败时保留默认展示名，AuthGuard 会负责导航 */
    }
  }, []);

  useEffect(() => {
    if (!preview) void resolveIdentity();
    // 异步身份解析在首帧后完成，避免阻塞交互
  }, [preview, resolveIdentity]);

  useEffect(() => {
    if (preview) return;
    void getSupabase().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
  }, [preview, router]);

  return (
    <StudentAgent
      displayName={displayName}
      demo={false}
      preview={preview}
      routeBase="/student"
      initialStep={stepId}
      reportPage={reportPage}
    />
  );
}