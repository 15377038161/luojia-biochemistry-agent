'use client';

import { useCallback, useEffect, useState } from 'react';
import StudentAgent from '@/components/agent/student-agent';
import { getSupabase } from '@/lib/supabase';

interface Props {
  preview?: boolean;
  stepId?: number;
  reportPage?: boolean;
  practiceMode?: boolean;
}

/**
 * 学生工作区路由入口（客户端）：
 * 登录态由根 layout 的 AuthGuard 统一守护（唯一拦截点），这里不再重复校验登录态，
 * 仅异步解析展示名（realname → email 前缀）后渲染业务聚合组件，避免多层 getUser 检查时序冲突。
 * practiceMode=true 时走教师体验隔离会话（/api/teacher/practice-session，不写正式学生数据）。
 */
export default function StudentRoutePage({ preview = false, stepId, reportPage = false, practiceMode = false }: Props) {
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

  return (
    <StudentAgent
      displayName={displayName}
      demo={false}
      preview={preview}
      practiceMode={practiceMode}
      routeBase="/student"
      initialStep={stepId}
      reportPage={reportPage}
    />
  );
}