'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, CircleCheckBig, FlaskConical, ShieldCheck } from 'lucide-react';
import LoginButton from '@/components/login-button';
import type { ChaoxingLoginOptions } from '@/lib/chaoxing-client';

interface NetworkInformationLike {
  saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationLike;
}

interface Props {
  demo: boolean;
  options: ChaoxingLoginOptions;
}

export default function LoginExperience({ demo, options }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [allowVideo, setAllowVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true;
    setAllowVideo(!reducedMotion && !saveData);
  }, []);

  useEffect(() => {
    if (!allowVideo || !videoRef.current) return;
    void videoRef.current.play().catch(() => setVideoReady(false));
  }, [allowVideo]);

  return (
    <main className="agent-login">
      <div className="agent-login-media" aria-hidden>
        {allowVideo && (
          <video
            ref={videoRef}
            className={videoReady ? 'is-ready' : ''}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            poster="/illustrations/login-luojia-poster-v1.webp"
            onCanPlay={() => setVideoReady(true)}
            onError={() => setVideoReady(false)}
          >
            <source src="/illustrations/login-luojia-loop-v1.webm" type="video/webm" />
            <source src="/illustrations/login-luojia-loop-v1.mp4" type="video/mp4" />
          </video>
        )}
      </div>
      <div className="agent-login-shade" aria-hidden />
      <Link href="/" className="agent-login-back"><ArrowLeft aria-hidden />返回介绍页</Link>

      <section className="agent-login-card" aria-labelledby="login-title">
        <div className="agent-login-brand">
          <span><FlaskConical aria-hidden /></span>
          <div><strong>珞珈生化智能体</strong><small>武汉大学生物化学文字实验</small></div>
        </div>
        <p className="agent-login-eyebrow"><BrainCircuit aria-hidden /> 智能体统一身份入口</p>
        <h1 id="login-title">用一个身份，进入与你匹配的学习空间</h1>
        <p className="agent-login-copy">学习通完成验证后，智能体会自动识别你的课程身份。学生进入八步文字推演，教师进入教学工作台并可切换独立学习体验。</p>

        <div className="agent-login-points">
          <p><CircleCheckBig aria-hidden /><span><b>无需手动选角色</b><small>权限由服务端稳定角色 ID 判断</small></span></p>
          <p><ShieldCheck aria-hidden /><span><b>教师体验数据隔离</b><small>不计成绩、不进入班级统计与同步</small></span></p>
        </div>

        <div className="agent-login-action">
          {demo && !options.configured ? (
            <Link href="/preview/student/map" className="agent-login-preview">进入智能体开发预览</Link>
          ) : (
            <LoginButton {...options} />
          )}
        </div>
        <p className="agent-login-privacy">继续即表示允许系统读取课程身份、学习步骤和修订记录；不会采集或生成真实实验数据。</p>
      </section>

      <aside className="agent-login-caption">
        <p>EGFP · 重组克隆主线</p>
        <strong>把实验思路写清楚，<br />让每次修订都有证据。</strong>
      </aside>
    </main>
  );
}
