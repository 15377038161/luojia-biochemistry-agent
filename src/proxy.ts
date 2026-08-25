import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase-ssr';

export async function proxy(request: NextRequest) {
  const previewEnabled = process.env.ENABLE_UI_PREVIEW === 'true';

  if (previewEnabled) {
    return NextResponse.next({ request });
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webm|mp4)$).*)'],
};
