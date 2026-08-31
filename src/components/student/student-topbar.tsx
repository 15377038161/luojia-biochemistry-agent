'use client';

import Link from 'next/link';
import { ArrowLeft, FileText, LogOut } from 'lucide-react';
import BrandLockup from '@/components/brand-lockup';

interface Props {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backLabel?: string;
  onOpenReport?: () => void;
  reportActive?: boolean;
  onLogout?: () => void;
}

export default function StudentTopbar({ title, subtitle, onBack, backLabel = '返回', onOpenReport, reportActive = false, onLogout }: Props) {
  return (
    <header className="student-topbar">
      <div className="student-topbar-inner">
        <Link href="/" className="student-topbar-brand" aria-label="返回珞珈生化智能体首页">
          <BrandLockup compact decorative />
          <b>珞珈生化智能体</b>
        </Link>
        {onBack && (
          <button type="button" onClick={onBack} className="student-topbar-back" aria-label={backLabel}>
            <ArrowLeft aria-hidden /> <span>{backLabel}</span>
          </button>
        )}
        <div className="student-topbar-title">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
        <div className="student-topbar-actions">
          {onOpenReport && (
            <button type="button" onClick={onOpenReport} className={reportActive ? 'is-active' : ''} aria-label="打开学习报告">
              <FileText aria-hidden /><span>学习报告</span>
            </button>
          )}
          {onLogout && (
            <button type="button" onClick={onLogout} aria-label="退出登录">
              <LogOut aria-hidden /><span>退出</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
