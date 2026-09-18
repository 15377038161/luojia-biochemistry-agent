'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * 教师工作区路由入口（客户端）：
 * 登录态由根 layout 的 AuthGuard 统一守护（唯一拦截点），这里不再重复校验登录态，
 * 仅异步解析展示名后渲染业务聚合组件；教学工作台能力判断由数据接口的 403 语义保证。
 */
export default function TeacherRoutePage({ preview = false, view = 'overview', contentStep, studentSessionId }: Props) {
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