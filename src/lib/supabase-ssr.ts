import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import {
  SUPABASE_AUTH_COOKIE_NAME,
  SUPABASE_COOKIE_ENCODING,
} from '@/lib/supabase-cookie-config';
import { getSupabaseCredentials } from '@/lib/supabase-client';

interface CookieReader {
  getAll(): Array<{ name: string; value: string }>;
}

interface CookieMutation {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * 判断是否应给 Session Cookie 打 Secure。
 */
function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production';
}

function createBaseServerClient(
  getAll: () => Array<{ name: string; value: string }>,
  setAll: (
    cookies: CookieMutation[],
    headers: Record<string, string>,
  ) => void,
) {
  const { url, anonKey, tenantId } = getSupabaseCredentials();
  return createServerClient(url, anonKey, {
    global: {
      headers: { 'X-Instance-ID': tenantId },
    },
    cookieEncoding: 'base64url',
    cookieOptions: {
      name: SUPABASE_AUTH_COOKIE_NAME,
      path: '/',
      sameSite: 'lax',
      secure: shouldUseSecureCookie(),
      // 浏览器端 Supabase 客户端（src/lib/supabase-browser.ts）需要读取该 Cookie
      // 才能给 Data API / Realtime / Storage 带上用户身份，故不能设为 httpOnly。
      // 代价：任意 XSS 都能读到 access_token 与 refresh_token。若业务不需要浏览器端
      // 直连 Supabase，应改为 httpOnly: true 并把数据访问全部收敛到服务端。
      httpOnly: false,
    },
    cookies: {
      encode: SUPABASE_COOKIE_ENCODING,
      getAll,
      setAll,
    },
  });
}

function applyCookie(response: NextResponse, cookie: CookieMutation): void {
  response.cookies.set(cookie.name, cookie.value, cookie.options);
}

function getSingleCookieMutation(cookies: CookieMutation[]): CookieMutation | null {
  if (cookies.length > 1) {
    throw new Error(
      'Supabase Session 超出单 Cookie 限制；Coze 网关不支持多个 Set-Cookie，请继续精简 JWT metadata',
    );
  }
  return cookies[0] ?? null;
}

export function createSupabaseRouteClient(request: NextRequest) {
  let pendingCookie: CookieMutation | null = null;
  const pendingHeaders = new Map<string, string>();
  const supabase = createBaseServerClient(
    () => request.cookies.getAll(),
    (cookies, headers) => {
      const cookie = getSingleCookieMutation(cookies);
      if (cookie) {
        if (pendingCookie && pendingCookie.name !== cookie.name) {
          throw new Error('同一响应不能写入多个 Supabase Cookie');
        }
        pendingCookie = cookie;
      }
      for (const [name, value] of Object.entries(headers)) pendingHeaders.set(name, value);
    },
  );

  return {
    supabase,
    applyToResponse(response: NextResponse): NextResponse {
      if (pendingCookie) applyCookie(response, pendingCookie);
      for (const [name, value] of pendingHeaders) response.headers.set(name, value);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    },
  };
}

export function createReadOnlySupabaseClient(cookies: CookieReader) {
  return createBaseServerClient(
    () => cookies.getAll(),
    () => {
      // Server Components cannot mutate cookies. src/proxy.ts refreshes them first.
    },
  );
}

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let responseCookieName: string | null = null;
  const supabase = createBaseServerClient(
    () => request.cookies.getAll(),
    (cookies, headers) => {
      const cookie = getSingleCookieMutation(cookies);
      if (cookie) {
        if (responseCookieName && responseCookieName !== cookie.name) {
          throw new Error('同一响应不能写入多个 Supabase Cookie');
        }
        responseCookieName = cookie.name;
        request.cookies.set(cookie.name, cookie.value);
      }
      response = NextResponse.next({ request });
      if (cookie) applyCookie(response, cookie);
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    },
  );

  await supabase.auth.getClaims();
  return response;
}
