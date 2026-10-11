# 运行模式判定统一标准 NODE_ENV（2026-10-11）

## 背景

部署后真实浏览器验收时，根页面出现空白 + `react-server-dom-turbopack` 堆栈 + `Performance.measure: Home cannot have a negative time stamp`。排查发现 `src/server.ts` 用非标准变量 `COZE_PROJECT_ENV` 判定 dev/prod，而生产启动脚本 `scripts/start.sh` 未声明 `NODE_ENV=production`，导致 `next({ dev: true })` 可能以 dev 模式运行。

## 修复内容

统一改用标准 `NODE_ENV` 判定运行模式：

1. `src/server.ts`：`const dev = process.env.NODE_ENV !== 'production';`，日志显示同步改用 `NODE_ENV`。
2. `scripts/start.sh`：启动命令显式 `NODE_ENV=production`。
3. `scripts/dev.sh`：启动命令显式 `NODE_ENV=development`。
4. `src/app/layout.tsx`：`isDev` 判定改为 `process.env.NODE_ENV === 'development'`。

**未改动**：`src/lib/integration-status.ts`（其 `COZE_PROJECT_ENV` 引用与运行模式无关，且 `CODER_PROJECTS_ENV` 实测为项目 ID 而非 PROD/DEV 枚举，不能当作环境枚举使用）。未引入双变量 fallback。

## 关键边界（重要）

- **沙箱环境 ≠ 真实部署进程**：沙箱中 `NODE_ENV`、`COZE_PROJECT_ENV`、`CODER_PROJECTS_ENV` 的取值不代表部署进程的实际注入。本次修复基于「脚本显式声明 NODE_ENV」这一确定性事实，而非依赖沙箱实测值。
- **线上空白根因尚未证实**：部署进程环境变量无法从沙箱读取，零日志不证明「静默 dev」。`turbopack` 堆栈也不单独证明 dev（生产 build 也可启用 Turbopack）。本轮修复消除了「运行模式判定依赖非标准变量」这一风险点，但线上空白需在部署后真实浏览器复测确认。
- 复测确认项：部署后访问根 `/` 应返回可交互页面（非空白），`/api/internal/chaoxing-health` 应返回应用 JSON（非平台「无访问权限」HTML）。

## 回归测试

新增 `tests/runtime-mode.test.ts`，覆盖：
- 运行模式判定语义：production→false / development→true / 未设置→true。
- `start.sh` 显式 production、`dev.sh` 显式 development。
- `server.ts`、`layout.tsx` 用标准 NODE_ENV 且无 `COZE_PROJECT_ENV` 残留。
