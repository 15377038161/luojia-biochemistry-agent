'use client';

import { useEffect, useState } from 'react';

const STEP_HINTS = [
  '正在保存你的实验方案…',
  '正在对照课程要点逐项评阅…',
  '正在计算五维能力得分…',
  '正在生成本步学习报告…',
];

const FULL_HINTS = [
  '正在汇总八步学习记录…',
  '正在整合逐项评阅证据…',
  '正在计算五维能力雷达…',
  '正在生成完整学习报告…',
];

interface Props {
  kind: 'step' | 'full';
  title?: string;
}

/**
 * 生化主题报告生成加载动画：锥形瓶 + 上升气泡 + 循环阶段文案。
 * 符合「科学探险手账」设计语言，且对 prefers-reduced-motion 降级。
 */
export default function ReportGenerating({ kind, title }: Props) {
  const hints = kind === 'step' ? STEP_HINTS : FULL_HINTS;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % hints.length), 1600);
    return () => clearInterval(timer);
  }, [hints.length]);

  const label = title ?? (kind === 'step' ? '本步报告' : '完整学习报告');

  return (
    <div className="report-generating" role="status" aria-live="polite">
      <style>{`
        .report-generating{display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 20px;text-align:center}
        .report-generating-flask{width:72px;height:92px;color:var(--science-green,#115740)}
        .report-generating-liquid{animation:reportGenLiquid 3.2s ease-in-out infinite;transform-origin:center}
        .report-generating-bubble{animation:reportGenBubble 2.6s ease-in infinite;opacity:0}
        .report-generating-bubble:nth-of-type(2){animation-delay:.6s}
        .report-generating-bubble:nth-of-type(3){animation-delay:1.2s}
        .report-generating-bubble:nth-of-type(4){animation-delay:1.8s}
        .report-generating-title{margin:0;color:var(--science-ink,#092e59);font-size:15px;font-weight:750}
        .report-generating-hint{margin:6px 0 0;color:var(--science-muted,#63788a);font-size:13px;line-height:1.7}
        .report-generating-dots{display:flex;justify-content:center;gap:6px;margin-top:12px}
        .report-generating-dots span{width:6px;height:6px;border-radius:999px;background:#cfe0ea;transition:background .3s ease,transform .3s ease}
        .report-generating-dots span.is-active{background:var(--science-green,#115740);transform:scale(1.35)}
        @keyframes reportGenLiquid{0%,100%{transform:translateY(0)}50%{transform:translateY(1.6px)}}
        @keyframes reportGenBubble{0%{transform:translateY(0) scale(.6);opacity:0}18%{opacity:.9}70%{opacity:.7}100%{transform:translateY(-46px) scale(1);opacity:0}}
        @media (prefers-reduced-motion:reduce){.report-generating-liquid,.report-generating-bubble{animation:none;opacity:.9}.report-generating-dots span{transition:none}}
      `}</style>
      <svg className="report-generating-flask" viewBox="0 0 120 150" aria-hidden="true">
        {/* 瓶颈 */}
        <path d="M50 10 h20 v4 h-20 z" fill="currentColor" opacity="0.9" />
        <path d="M53 14 h14 v20 h-14 z" fill="none" stroke="currentColor" strokeWidth="3" />
        {/* 锥形瓶身 */}
        <path d="M55 34 L65 34 L91 132 L29 132 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        {/* 液体（EGFP 荧光绿） */}
        <g className="report-generating-liquid">
          <path d="M40 100 L80 100 L87 128 L33 128 Z" fill="#55D99A" opacity="0.35" />
          <path d="M40 100 L80 100 L87 128 L33 128 Z" fill="none" stroke="#55D99A" strokeWidth="1.5" opacity="0.6" />
        </g>
        {/* 上升气泡 */}
        <g fill="#55D99A">
          <circle className="report-generating-bubble" cx="52" cy="112" r="3.4" />
          <circle className="report-generating-bubble" cx="63" cy="118" r="2.6" />
          <circle className="report-generating-bubble" cx="71" cy="110" r="3" />
          <circle className="report-generating-bubble" cx="58" cy="122" r="2.2" />
        </g>
      </svg>
      <div>
        <p className="report-generating-title">{label}生成中</p>
        <p className="report-generating-hint" key={index}>{hints[index]}</p>
        <div className="report-generating-dots" aria-hidden="true">
          {hints.map((_, dotIndex) => (
            <span key={dotIndex} className={dotIndex === index ? 'is-active' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
