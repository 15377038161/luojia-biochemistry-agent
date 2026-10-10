# 平台密钥注入能力核实与阻塞说明

> 本文件不含任何密钥值、令牌或凭据，仅用于向平台技术支持说明当前能力边界与诉求。
> 生成日期：以 git 提交时间为准。关联分支：backup/env-tracking-20261010-190510。

## 一、问题现状

项目（luojia-biochemistry-agent）的生产环境变量文件 `.env.production` 当前被 git 跟踪，其中包含超星 OAuth、同步 Worker 鉴权、AI 网关等业务配置（含真实密钥）。需要将其移出 git 跟踪以消除密钥泄露面，但移出后生产部署将丢失这些运行配置，必须先确认平台是否提供「部署时注入业务环境变量/密钥」的原生通道。

## 二、已核实的能力边界（只读调查）

| 调查对象 | 结论 |
|---|---|
| `coder` CLI 子命令 | 仅 `init / templates / dev / build / start / validate / help`，**无 secret / env 配置子命令** |
| `coder templates` | 仅 `vite` / `nextjs` 模板说明，无密钥配置 |
| `.coder` 配置文件格式 | 仅 `[project]` / `[dev]` / `[deploy]` 三段（requires/build/run/validate/deps），**无 env/secret 段** |
| `coder-coding-dev-sdk` | 暴露 `LLM/TaskFlow/Supabase/Storage/Search/Knowledge/Document/Plugin` 客户端，**无 secret/env 管理接口** |
| SDK 环境变量 | `CODER_CODING_API_KEY` / `CODER_CODING_BASE_URL` / `CODER_CODING_MODEL_*`（平台注入的 SDK 自身鉴权，非业务密钥） |
| `scripts/gen-env.js` | 依赖 `coze_workload_identity` Python 模块，**该模块在沙箱当前不可用**（ModuleNotFoundError），且枚举的是历史 `COZE_*` 前缀 |
| 平台进程环境变量 | 已注入 `CODER_SUPABASE_*`、`DEPLOY_RUN_PORT`、`CODER_PROJECTS_DOMAIN`、`CODER_PROJECTS_ENV`、`CODER_CODING_*`；**业务密钥（CHAOXING_*、SYNC_WORKER_SECRET、AI_GATEWAY_*）均不存在** |

## 三、结论

当前平台**未发现**面向应用业务密钥的「部署时安全注入」原生通道：

1. coder CLI 与 `.coder` 配置均不支持声明 secret/env；
2. SDK 不提供 secret 管理能力；
3. 历史 workload identity 拉取机制（gen-env.js）依赖的 Python 模块在当前环境不可用，且键名前缀已过时。

因此，业务密钥目前只能以 `.env.production` 文件形式存在并被 git 跟踪，无法安全移出。

## 四、诉求（供平台技术支持）

请确认并提供以下任一能力（满足其一即可解除阻塞）：

1. **部署时业务环境变量/密钥注入**：允许在项目设置中为部署环境配置自定义环境变量（如 `CHAOXING_SECRET`、`SYNC_WORKER_SECRET`、`AI_GATEWAY_*` 等），部署时自动注入进程，无需随代码提交。
2. **或确认 `.env.production` 等未跟踪文件在部署时可从本地/对象存储保留**：即部署产物可携带 git 之外的环境文件。

在平台明确答复前，本项目暂停 `.env.production` 的移出跟踪与相关部署，避免线上服务因配置丢失而失联。

## 五、需要轮换的真实秘密字段（仅列字段名，不含值）

- `CHAOXING_SECRET`（超星 OAuth 密钥）
- `SYNC_WORKER_SECRET`（同步 Worker 鉴权密钥）

> 非密钥字段（无需轮换）：`CHAOXING_APPID`、`CHAOXING_FIDS`、`CHAOXING_REDIRECT_URI`、`AI_GATEWAY_CHAT_URL`、`AI_MODEL_QUALITY`、`AI_MODEL_FAST`、`ENABLE_*`、`AI_GATEWAY_TIMEOUT_MS`、`AI_GATEWAY_RETRY_COUNT`。
