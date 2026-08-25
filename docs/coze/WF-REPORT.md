# WF-REPORT节点契约

输入：`student_name`、八步`steps`、正式`attempts`和`constraints`。

节点顺序：开始 → 数据完整性检查 → 八步摘要 → 五维能力解读 → 问题证据归类 → 成因边界检查 → 可执行改进行动 → 事实核对 → 结构化结束。

输出 `StudyReport.v2`：顶层包含 `schemaVersion`、`markdown` 和 `sections`；`sections` 固定包含 `dataBasis`、`dimensionDefinitions`、`stepEvidence`、`strengths`、`issues`、`causeBoundaries`、`actionPlan`、`gradeStatus`、`teacherReviewStatus`。Markdown 至少包含“学习范围与数据依据、能力解读、关键问题（场景／证据／影响）、成因边界、可执行行动、总评”。只能使用输入中的真实记录；数据不足时写“暂无足够证据”，不能补写未完成步骤、虚构参数或实验结果，也不能生成正式实验报告。
