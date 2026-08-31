import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BrainCircuit,
} from 'lucide-react';
import LoginButton from '@/components/login-button';
import BrandLockup from '@/components/brand-lockup';
import LabHeroVisual from '@/components/lab-hero-visual';
import type { ChaoxingLoginOptions } from '@/lib/chaoxing-client';

interface Props {
  demo: boolean;
  authenticated?: boolean;
  displayName?: string;
  defaultWorkspace?: 'student' | 'teacher';
  options: ChaoxingLoginOptions;
}

export default function HomeEntry({
  demo,
  authenticated = false,
  displayName,
  defaultWorkspace = 'student',
  options,
}: Props) {
  const destination = defaultWorkspace === 'teacher' ? '/teacher/dashboard' : '/student/map';

  return (
    <main className="unified-entry">
      <div className="unified-entry-art" aria-hidden />
      <div className="unified-entry-wash" aria-hidden />

      <header className="unified-entry-nav">
        <div className="unified-entry-brand">
          <BrandLockup decorative showChaoxing={false} />
          <div>
            <strong>珞珈生化智能体</strong>
            <small>WHU · BIOCHEM TEXT LAB</small>
          </div>
        </div>
        <span className="unified-entry-course">EGFP · 八步文字推演</span>
      </header>

      <section className="unified-entry-stage" aria-labelledby="entry-title">
        <div className="unified-entry-copy">
          <p className="unified-entry-eyebrow">
            <BrainCircuit aria-hidden /> 武汉大学 · 生物化学课程智能体
          </p>
          {authenticated && <p className="unified-entry-welcome">欢迎回来，{displayName || '同学'}</p>}
          <h1 id="entry-title">先用文字想清楚，<br />再走进实验室。</h1>

          <div className="unified-entry-action">
            {authenticated ? (
              <Link href={destination} prefetch className="unified-entry-primary">
                {defaultWorkspace === 'teacher' ? '进入教学工作台' : '继续文字实验'}
                <ArrowRight aria-hidden />
              </Link>
            ) : demo ? (
              <Link href="/student/map?preview=1" className="unified-entry-primary">
                <Image
                  src="/brand/xuexitong-icon.jpg"
                  alt=""
                  width={24}
                  height={24}
                  className="unified-entry-chaoxing-icon"
                />
                进入智能体开发预览<ArrowRight aria-hidden />
              </Link>
            ) : (
              <LoginButton {...options} />
            )}
          </div>

        </div>
        <LabHeroVisual />
      </section>

      <footer className="unified-entry-footer">
        武汉大学生物化学文字实验智能体 · 课程学习辅助
      </footer>
    </main>
  );
}
