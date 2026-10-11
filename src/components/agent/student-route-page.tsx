'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import StudentAgent from '@/components/agent/student-agent';
import { getSupabase } from '@/lib/supabase';

interface Props {
  preview?: boolean;
  stepId?: number;
  reportPage?: boolean;
  practiceMode?: boolean;
  notice?: string;
}

/**
 * 学生工作区路由入口（客户端）：
 * 登录态由根 layout 的 AuthGuard 统一守护（唯一拦截点），这里不再重复校验登录态，
 * 仅异步解析展示名（realname → email 前缀）后渲染业务聚合组件，避免多层 getUser 检查时序冲突。
 * practiceMode=true 时走教师体验隔离会话（/api/teacher/practice-session，不写正式学生数据）。
 * notice 为登录后安全路由回退携带的明确提示（如无教师权限），顶部横幅展示。
 */
export default function StudentRoutePage({ preview = false, stepId, reportPage = false, practiceMode = false, notice }: Props) {
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
    <>
      {notice && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning/95 px-4 py-2.5 text-sm font-bold text-warning-foreground shadow-md">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      <StudentAgent
        displayName={displayName}
        demo={false}
        preview={preview}
        practiceMode={practiceMode}
        routeBase="/student"
        initialStep={stepId}
        reportPage={reportPage}
      />
    </>
  );
}