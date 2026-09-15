'use client';

import { useEffect, useState } from 'react';
import HomeEntry from '@/components/home-entry';
import { getSupabase } from '@/lib/supabase';

/**
 * 首页 `/`：登录态存于浏览器 localStorage，需在客户端解析。
 * 认证守卫（AuthGuard，见 app/layout.tsx）已保证未登录用户会被引导到 /login，
 * 因此此处只在已登录态渲染"欢迎回来/继续实验"入口；预览模式渲染演示入口。
 */
export default function Home() {
  const [identity, setIdentity] = useState<{ displayName: string; defaultWorkspace: 'student' | 'teacher' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data.user) return;
        const m = (data.user.user_metadata ?? {}) as Record<string, unknown>;
        const name = typeof m.realname === 'string' && m.realname.trim()
          ? m.realname.trim()
          : (data.user.email?.split('@')[0]) || '同学';
        setIdentity({ displayName: name, defaultWorkspace: 'student' });
      })
      .catch(() => { /* 会话读取失败时按未登录态渲染，守卫会引导到 /login */ });
    return () => { cancelled = true; };
  }, []);

  if (process.env.NEXT_PUBLIC_ENABLE_UI_PREVIEW === 'true') {
    return <HomeEntry demo />;
  }

  return (
    <HomeEntry
      demo={process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCESS === 'true'}
      authenticated={identity !== null}
      displayName={identity?.displayName}
      defaultWorkspace={identity?.defaultWorkspace}
    />
  );
}