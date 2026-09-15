import { NextResponse } from 'next/server';
import { getSupabaseCredentials } from '@/lib/supabase-client';

export async function GET() {
  try {
    const { url, anonKey, tenantId } = getSupabaseCredentials();

    if (!url || !anonKey || !tenantId) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url, anonKey, tenantId }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Failed to get Supabase config:', error);
    return NextResponse.json(
      { error: 'Failed to get Supabase config' },
      { status: 500 },
    );
  }
}
