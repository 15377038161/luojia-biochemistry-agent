'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from '@/lib/auth';

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function handleLogout() {
    setPending(true);
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error(error);
      setPending(false);
    }
  }
  return <button className="logout-button" disabled={pending} onClick={handleLogout}><LogOut />{pending ? '退出中…' : '退出'}</button>;
}
