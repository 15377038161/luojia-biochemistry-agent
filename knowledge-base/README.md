# 知识库交付说明

本目录同时保存两类材料：

- `raw-teacher-materials/`：老师提供的原始DOCX、PPTX和图片，仅供校内建设、复核与追溯，不应公开发布。
- `structured/`：供智能体、Coze工作流和Supabase内容种子使用的结构化八步内容、图片题和权威来源哈希。

更新老师材料后应依次执行：

```bash
pnpm export:knowledge
pnpm seed:content
```

正式发布前必须由课程老师确认存在冲突或尚未确认的参数；模型不能自行裁决材料冲突。
