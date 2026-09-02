'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, BookOpen } from 'lucide-react';

interface MeResponse {
  user?: {
    capabilities?: {
      teacherWorkspace?: boolean;
    };
  };
}

export function RoleSwitchFab() {
  const pathname = usePathname();
  const [canSwitch, setCanSwitch] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled) return;
        setCanSwitch(Boolean(data?.user?.capabilities?.teacherWorkspace));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !canSwitch) return null;

  const onStudentSide = pathname?.startsWith('/student');
  const onTeacherSide = pathname?.startsWith('/teacher');

  if (onStudentSide) {
    return (
      <Link
        href="/teacher/dashboard"
        className="role-switch-fab"
        aria-label="切换到教师端"
      >
        <GraduationCap size={20} />
        <span>教师端</span>
      </Link>
    );
  }

  if (onTeacherSide) {
    return (
      <Link
        href="/student/map"
        className="role-switch-fab role-switch-fab--student"
        aria-label="切换到学生端"
      >
        <BookOpen size={20} />
        <span>学生端</span>
      </Link>
    );
  }

  return null;
}
