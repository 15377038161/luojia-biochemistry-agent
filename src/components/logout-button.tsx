'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error(`退出失败：${response.status}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      setPending(false);
    }
  }
  return <button className="logout-button" disabled={pending} onClick={logout}><LogOut />{pending ? '退出中…' : '退出'}</button>;
}
