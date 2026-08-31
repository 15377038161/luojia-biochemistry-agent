# 部署构建失败修复计划：evaluate 路由 `state` 空值类型错误

## 概述

部署流水线在 `next build` 的 TypeScript 检查阶段失败：`src/app/api/student/evaluate/route.ts:52` 报 `Type error: 'state' is possibly 'null'`。根因是第 28-29 行通过 `maybeSingle()` 查询 `step_states`（该步骤首次提交时行可能尚不存在，`state` 为 null），第 31 行已正确用 `(state?.attempt_count ?? 0) + 1` 容错，但第 52 行构造超星任务流载荷时漏掉了空值处理。本次做一行式修复并做全量类型检查扫尾，确保部署构建通过。

## 技术方案

| 维度 | 选择 | 理由 |
|---|---|---|
| 修复方式 | 第 52 行改为 `(state?.attempt_count ?? 0) + 1` | 与同文件第 31 行完全一致，保证 `evaluateText` 与 `chaoxingTaskflow.versionNo` 两处版本号口径统一 |
| 空值语义 | `state` 为 null 时按 `attempt_count = 0` 处理，`versionNo` 从 1 起 | 符合 `AGENTS.md` 已沉淀的约定："对可能缺失的 step_states 行用 maybeSingle + 默认 0 容错" |
| 验证方式 | `pnpm ts-check`（tsc 全量）优先，再跑构建 | Next build 遇首个类型错误即中止，tsc 一次性暴露全部存量类型问题，避免部署反复试错 |
| 改动范围 | 仅 API 路由，无页面/样式改动 | 纯后端类型修复 |

## 功能模块

### 1. evaluate 路由空值容错修复
- `src/app/api/student/evaluate/route.ts` 第 52 行：`state.attempt_count + 1` → `(state?.attempt_count ?? 0) + 1`。
- 不改变其余逻辑：鉴权、`current_step` 的 `Number(...) || 1` 归一、RPC 记录、超星载荷构造均保持现状。

### 2. 全量类型检查扫尾
- Next 构建在首个类型错误处中止，修复后可能暴露后续错误；以 `pnpm ts-check` 全量扫描，对发现的同类问题（其他 `maybeSingle` 结果的空值访问）一并修复。
- 已预排查：`report-data/route.ts:139` 已用 `state?.attempt_count || 0`，其余 `maybeSingle` 使用点暂无构建报错，以 tsc 实际输出为准。

## 是否有原型设计

否。项目已完成首轮开发，本次属于部署构建失败的 bug 修复，无任何页面/样式改动；设计引导规则明确"首次开发完成后的 bug 修复、样式优化、小功能迭代不需要原型设计"。

## 实施步骤

1. **修复空值类型错误**：`src/app/api/student/evaluate/route.ts` 第 52 行改为可选链 + 默认 0 容错，与第 31 行口径一致。
2. **全量类型检查扫尾**：运行 `pnpm ts-check`，若暴露其他存量类型错误一并修复，直至零错误。
3. **构建与静态校验**：运行 `pnpm validate`（ts-check + lint）及生产构建，确认与部署流水线同款的 `next build` TypeScript 环节通过。
4. **交付确认与经验沉淀**：核对 `AGENTS.md` 既有约定已覆盖本次教训（缺失 `step_states` 行的容错规范），如有必要补充"超星载荷构造处同样适用"的说明。
