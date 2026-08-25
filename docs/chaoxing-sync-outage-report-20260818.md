# 学习通（超星）数据回流链路故障排查报告

- **报告日期**: 2026-08-18
- **故障现象**: 学习通成绩数据回流无法接通
- **排查结论**: 根因已定位，链路代码与内部调度全部正常；故障为**表单回传凭据从未配置**，推送请求从未真正发出
- **影响范围**: 2026-08-14 17:49 起的 30 条成绩事件积压于 `sync_outbox`，无数据丢失（持久化 + 退避重试）

---

## 1. 链路架构（背景）

```
学生提交/成绩落库
  → DB 触发器写入 sync_outbox (status=pending)
  → src/server.ts 启动 30s 后每 5 分钟自调用 POST /api/internal/sync-chaoxing (Bearer SYNC_WORKER_SECRET)
  → processChaoxingOutbox() 读取到期记录
  → sendToChaoxing() POST CHAOXING_FORM_WRITE_URL (Bearer CHAOXING_FORM_WRITE_TOKEN, Idempotency-Key=event_id)
  → 成功 → status=succeeded；失败 → 4xx(非429)=manual / 5xx·超时=pending+退避 / 缺凭据=SYNC_DISABLED 延期1小时
```

## 2. 排查过程与证据

### 2.1 配置参数核对（任务 1、2）

| 配置项 | .env（本地） | .env.production（生产） | 状态 |
|---|---|---|---|
| `CHAOXING_APPID` / `CHAOXING_SECRET` / `CHAOXING_FIDS` | 已配置 | 已配置 | 正常（登录 OAuth 链路） |
| `CHAOXING_REDIRECT_URI` | 已配置 | 已配置 | 正常 |
| `SYNC_WORKER_SECRET`（内部调度鉴权） | 已配置 | 已配置 | 正常 |
| **`CHAOXING_FORM_WRITE_URL`（回传接口地址）** | **缺失** | **缺失** | **故障点** |
| **`CHAOXING_FORM_WRITE_TOKEN`（回传凭据）** | **缺失** | **缺失** | **故障点** |

### 2.2 数据库取证

```sql
SELECT status, count(*) FROM sync_outbox GROUP BY status;
-- pending: 30 条（2026-08-14 17:49 ~ 2026-08-18 13:17），无 succeeded / manual / failed
SELECT last_error, count(*), max(attempt_count) FROM sync_outbox GROUP BY last_error;
-- '接口未授权，等待配置' × 30，attempt_count 全部为 0
```

`attempt_count = 0` 是关键证据：代码中 `SYNC_DISABLED` 分支不累加尝试次数，证明**从未向超星回传端点发出过任何 HTTP 请求**——这是"从未接通"，不是"接通后中断"。

### 2.3 运行日志取证（任务 3）

- 生产运行日志中检索 `sync-worker`、`chaoxing` 关键词：**无任何错误记录**。
- 与代码行为一致：`SYNC_DISABLED` 在 `processChaoxingOutbox` 内部被捕获并静默延期，内部路由返回 200，调度器不打印错误。链路"看起来健康"但从未推送，属于**静默故障**。
- 无网络层错误（超时、DNS、TLS），无 4xx/5xx 响应码——因为请求根本没发出去。

### 2.4 连通性实测（任务 4）

对 dev server（端口 5000）手动发起请求：

| 测试 | 请求 | 结果 | 判定 |
|---|---|---|---|
| 鉴权层 | `POST /api/internal/sync-chaoxing`（无凭据） | HTTP 403 `FORBIDDEN` | 鉴权拦截正常 |
| 读取请求 | `POST /api/internal/sync-chaoxing`（带 Bearer，人工将 1 条积压的 `next_attempt_at` 拨至过去） | HTTP 200，`{processed:1, deferred:1}` | DB 读取正常 |
| 写入请求 | 同上（链路内部尝试推送超星） | `SYNC_DISABLED`，记录延期 1 小时（13:19→14:20 验证写回成功） | 写入在凭据检查处被拒，**代码路径正常** |
| 外部网络 | `curl https://passport2.chaoxing.com` | HTTP 302，46ms，DNS 正常解析 | 到超星网络连通正常 |

### 2.5 外部因素排查（任务 5）

| 嫌疑因素 | 排查结论 |
|---|---|
| 网络策略变更/封锁 | **排除**：出网到超星域名连通正常；且推送请求从未发出，不存在被网络层拒绝的记录 |
| 接口权限调整（Token 失效） | **排除**：Token 从未配置过，不存在"失效"前提；无 401/403 响应记录 |
| 超星接口升级 | **排除**：从未有请求到达超星端点，无版本不兼容错误可考 |
| 内部调度/代码故障 | **排除**：调度器、鉴权、读取、状态写回逐项实测正常（见 2.4） |

## 3. 根因定位（任务 6）

- **故障触发节点**: `src/lib/chaoxing-sync.ts` → `sendToChaoxing()` 开头的凭据检查（第 15–17 行）
- **错误码**: `SYNC_DISABLED`（DB 中呈现为 `last_error = '接口未授权，等待配置'`）
- **根因**: 表单回传接口地址（`CHAOXING_FORM_WRITE_URL`）与认证凭据（`CHAOXING_FORM_WRITE_TOKEN`）自上线起**从未配置**，与项目文档（AGENTS.md）记录的已知状态一致。链路属"待接入"而非"故障中断"。

## 4. 恢复方案（需外部凭据后执行）

恢复动作依赖超星方提供的两个凭据，当前环境无法自行生成（不可编造）：

1. **获取凭据**：向超星侧获取表单写入接口地址与 Bearer Token（表单 ID 已硬编码为 `3513491`）。
2. **写入配置**：
   - 生产：写入 `.env.production`（随仓库生效），重新部署；
   - 本地：写入 `.env`，重启 dev server。
3. **立即补投（可选）**：积压记录当前 `next_attempt_at` 被推后至多 1 小时，如需立即补投：
   ```sql
   UPDATE sync_outbox SET next_attempt_at = now() WHERE status = 'pending';
   ```
   调度器每 5 分钟一轮、每轮最多 20 条，30 条积压预计 2 轮内投完。
4. **恢复验证**：
   ```bash
   curl -s -X POST -H "Authorization: Bearer $SYNC_WORKER_SECRET" \
     http://localhost:5000/api/internal/sync-chaoxing
   # 预期 {"ok":true,"data":{"processed":N,"succeeded":N,...}}
   ```
   再查 `sync_outbox`：`status` 应转为 `succeeded`、`last_error` 清空。

## 5. 预防建议

1. **可见性**: `SYNC_DISABLED` 目前完全静默（HTTP 200、无日志），建议后续在 `processChaoxingOutbox` 命中 `SYNC_DISABLED` 时输出一条 WARN 日志（含积压条数），避免此类"静默待配置"再次被误判为网络故障。
2. **上线检查**: 部署 checklist 中将 `CHAOXING_FORM_WRITE_URL` / `CHAOXING_FORM_WRITE_TOKEN` 列为发布前检查项。
3. **积压监控**: 可为 `sync_outbox` 中 `pending` 且 `created_at` 超过 24h 的条数设置告警阈值。
