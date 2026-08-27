# 超星登录教师/学生角色识别加固计划（方案A·最小修补）

## 概述

回应"超星统一身份认证下教师/学生如何区分、学生扫码会不会进教师端"的安全疑虑。经代码核查：系统**已具备角色识别**（登录时按超星返回的角色列表判定教师/学生，教师端 API 有服务端 403 拦截，学生扫码登录只会进入学生端），但存在两个薄弱点需修补：① 数据库 RLS 策略 `profiles_self_update` 允许任何登录用户自改档案全部字段（含 `role` 与用于成绩归属的 `student_no`），构成提权/成绩篡改隐患；② 角色判定完全依赖超星字段，无审计日志、无面向用户的判定结果反馈，真实教师被误判为时无从知晓。本次只修补这两点，不引入白名单等新机制。

## 现状结论（对用户问题的直接回答）

- **识别机制已存在**：`src/lib/supabase-chaoxing-user.ts` 在登录时读取超星 `getUserByTokenFormMooc` 返回的 `role` 数组，角色名匹配 `教师|teacher|管理员` 即判教师，否则学生；结果写入 `app_metadata.app.role` 与 `profiles.role`。
- **学生扫码不会进教师端**：二维码只是登录入口，身份 = 扫码者本人的超星账号。学生扫码后超星返回学生角色 → 判为学生 → 首页服务端渲染学生端；教师端 API（`/api/teacher/*`）另有服务端 `appRole !== 'teacher'` 的 403 拦截。
- **薄弱点一（本次修复）**：`supabase/migrations/202608140001_agent_core.sql` 的 `profiles_self_update` 策略仅校验行归属、不限列，浏览器端又可通过 `/api/supabase-config` 拿到 Supabase 连接信息 → 学生可用 Supabase 客户端把自身 `role` 改成 teacher、把 `student_no` 改成他人学号（影响超星成绩回传归属）。
- **薄弱点二（本次修复）**：超星若未返回 role 字段则全员静默判学生，无日志可查、无界面反馈。

## 技术方案

| 维度 | 选择 | 理由 |
|---|---|---|
| RLS 修复方式 | 直接 `drop policy profiles_self_update` | 全仓仅两处写 `profiles`（`supabase-chaoxing-user.ts`、`demo-auth.ts`）均为服务端 admin 客户端，无合法客户端自改需求；admin 客户端绕过 RLS，服务端写入不受影响 |
| 教师判定依据 | 维持现状（超星角色正则），不引入白名单 | 用户已选方案 A |
| 审计能力 | 登录时输出结构化角色判定日志（超星原始角色 → 判定结果） | 为"某教师为何没进教师端"提供生产排查证据 |
| 用户反馈 | 双端头部增加身份徽标；学生端徽标附申诉指引 | 让被误判的教师当场看到"系统判定我为学生"及处理路径 |
| 样式 | 复用现有自定义 class 体系（`.demo-badge`/`.user-name` 同族），新增 `.role-badge` | 与现有 header 视觉语言一致，不引入新样式体系 |

## 功能模块

### 1. RLS 提权漏洞修复（数据库迁移）
- 新增迁移 `supabase/migrations/202608190001_profiles_role_lockdown.sql`：`drop policy if exists profiles_self_update on public.profiles;` 附注释说明原因。
- 通过开发库执行迁移并复核 `pg_policies`。

### 2. 登录角色审计日志
- `createSupabaseLoginToken` 判定 role 后输出 `console.info`：姓名、uid、fid、超星原始角色列表、判定结果（teacher/student）。
- 不改判定逻辑本身（正则与 `.some()` 行为保持现状）。

### 3. 身份徽标与申诉指引
- `src/app/page.tsx` 向 `StudentAgent`/`TeacherAgent` 增传 `appRole` 与超星角色名列表；预览路由（无会话）传空值，徽标不渲染。
- 学生端/教师端 header 的 `displayName` 旁渲染身份徽标（学生/教师）；学生端徽标附 `title` 提示："身份由学习通返回的角色信息判定，如有异议请联系管理员"。
- 预览模式（`preview = true`）不渲染徽标，避免假数据误导。

## 是否有原型设计

否。项目已完成首轮开发（完整双端功能与 UI 验收记录在案），本次属于安全加固类小迭代；设计引导规则明确"首次开发完成后的 bug 修复、样式优化、小功能迭代不需要原型设计"。徽标样式沿用现有 header 视觉语言。

## 实施步骤

1. **封堵 RLS 提权漏洞**：新增迁移文件 drop `profiles_self_update` 策略，并在开发库执行、复核 `pg_policies` 结果 — `supabase/migrations/202608190001_profiles_role_lockdown.sql`
2. **登录角色审计日志**：在 `createSupabaseLoginToken` 中记录超星原始角色与判定结果 — `src/lib/supabase-chaoxing-user.ts`
3. **身份徽标与申诉指引**：`page.tsx` 传参扩展，双端 header 渲染身份徽标与学生端申诉提示，预览模式不渲染 — `src/app/page.tsx`、`src/components/agent/student-agent.tsx`、`src/components/agent/teacher-agent.tsx`
4. **交付验证**：静态检查（ts-check）+ 预览路由走查（`/preview/student`、`/preview/teacher` 徽标不误渲染）+ 演示登录链路回归确认服务端写入不受 RLS 变更影响
5. **经验沉淀**：更新 `AGENTS.md`（角色识别机制、profiles 只写服务端、RLS 教训）

## 页面规格

本次无新页面、无导航变化，仅改动 @page(/) 的 header 区域。

##### @page(/) 双智能体工作台（header 局部变更）

**变更位置**：`.app-header > .header-actions` 内，`displayName` 与登出按钮之间新增身份徽标。
**徽标规格**：
- 教师端：文案"教师身份"，金色调（与现有 `.gold` 品牌色一致）。
- 学生端：文案"学生身份"，中性色调；`title` 属性附申诉指引文案。
- 有会话时才渲染；演示/预览模式（provider 为 demo 或 preview = true）不渲染，避免误导。

**交互说明**

| 元素 | 动作 | 响应 | 传参 | 备注 |
|------|------|------|------|------|
| 身份徽标（学生端） | 悬停 | 显示 title 提示："身份由学习通返回的角色信息判定，如有异议请联系管理员" | — | 仅展示，无点击行为 |
| 身份徽标（教师端） | 悬停 | 无 | — | 仅展示 |
