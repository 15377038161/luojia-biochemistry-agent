'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FlaskConical, GraduationCap, UserRoundSearch, X } from 'lucide-react';

export default function GuestModeDialog() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" className="guest-mode-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <UserRoundSearch />
        游客模式 / 功能演示
      </button>
      {open && (
        <div className="guest-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="guest-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-mode-title" aria-describedby="guest-mode-description">
            <button ref={closeButtonRef} type="button" className="guest-dialog-close" aria-label="关闭游客模式窗口" onClick={() => setOpen(false)}><X /></button>
            <header className="guest-dialog-header">
              <span className="guest-dialog-kicker">无需登录 · 可真实操作</span>
              <h2 id="guest-mode-title">选择要查看的实验记录册</h2>
              <p id="guest-mode-description">两个入口均使用真实业务组件和本地演示数据，不会写入正式课程记录。</p>
            </header>
            <div className="guest-role-grid">
              <article className="guest-role-card student-role-card">
                <span className="guest-role-icon"><FlaskConical /></span>
                <div><small>学生实验智能体</small><h3>体验八步文字实验</h3><p>可提问、提交步骤描述、查看图片任务、路线与学习报告。</p></div>
                <Link href="/preview/student" onClick={() => setOpen(false)}>进入学生端 <ArrowRight /></Link>
              </article>
              <article className="guest-role-card teacher-role-card">
                <span className="guest-role-icon"><GraduationCap /></span>
                <div><small>教师分析智能体</small><h3>查看班级学习分析</h3><p>可查询班级进度、高频遗漏、待复核记录与数据证据。</p></div>
                <Link href="/preview/teacher" onClick={() => setOpen(false)}>进入教师端 <ArrowRight /></Link>
              </article>
            </div>
            <p className="guest-dialog-note">正式登录仍通过超星与 Supabase 会话完成；游客模式仅用于功能验收。</p>
          </section>
        </div>
      )}
    </>
  );
}
