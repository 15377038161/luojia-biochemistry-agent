import { redirect } from 'next/navigation';

/**
 * 首页 `/`：仅作为根路径兜底，将已登录用户直接导向八步地图。
 * 登录态守卫由根 layout 的 AuthGuard 统一负责——未登录访问 `/` 会被先引导到 /login，
 * 已登录（含 OAuth 回跳完成后）则直达学生实验地图，不再经过任何中间落地页。
 * 登录成功后 POST_LOGIN_HOME 也指向 /student/map，与此处保持一致。
 */
export default function Home() {
  redirect('/student/map');
}
