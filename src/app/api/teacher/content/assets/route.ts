import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

const ACCEPTED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅教师可上传课程素材。', retryable: false }, undefined, 403);
  try {
    const form = await request.formData();
    const file = form.get('file');
    const stepId = Number(form.get('stepId'));
    if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      return fail({ code: 'VALIDATION_ERROR', message: '仅支持10MB以内的 JPG、PNG 或 WebP 图片。', retryable: false }, undefined, 400);
    }
    if (!Number.isInteger(stepId) || stepId < 1 || stepId > 8) {
      return fail({ code: 'VALIDATION_ERROR', message: '步骤编号必须在1到8之间。', retryable: false }, undefined, 400);
    }
    const extension = ACCEPTED_TYPES.get(file.type);
    const storagePath = `egfp-v2/step-${stepId}/${randomUUID()}.${extension}`;
    const { supabase } = createSupabaseRouteClient(request);
    const { error } = await supabase.storage.from('course-assets').upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('course-assets').getPublicUrl(storagePath);
    return ok({ path: storagePath, url: data.publicUrl, size: file.size, mimeType: file.type });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
