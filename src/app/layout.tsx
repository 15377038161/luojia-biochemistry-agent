import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import './globals.css';
import './ui-system.css';
import './learning-workspace.css';

export const metadata: Metadata = {
  title: { default: '珞珈生化智能体', template: '%s｜珞珈生化智能体' },
  description: '武汉大学生物化学文字实验智能体：完成 EGFP 八步文字推演、证据化点评与学习报告。',
  keywords: ['武汉大学', '生物化学实验', '教学智能体', 'EGFP'],
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';
  const isUiPreview = process.env.ENABLE_UI_PREVIEW === 'true';
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <SupabaseConfigProvider disabled={isUiPreview}>
          {isDev && <Inspector />}
          {children}
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}
