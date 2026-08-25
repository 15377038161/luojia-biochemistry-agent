# WF-TEXT节点契约

输入：`mode`、`step`、`student_answer`或`question`、`attempt_no`、`constraints`。

节点顺序：开始 → 模式分支 → 当前步骤知识检索 → 参数/顺序/Gate规则检查 → 大模型语义评阅或引导回答 → JSON结构校验 → 结束。

`evaluate`模式必须输出`TextEvaluation.v2`，字段与`src/domain/agent.ts`一致；五维满分固定20/30/20/15/15。结论只能是`pass`、`revise`或`teacher_review`。所有覆盖结论必须引用学生原话，不能输出完整标准答案。

`detailedIssues` 中的每项必须包含 `dimension`、`kind`、`title`、`evidence`、`scenario`、`impact`、`causeBoundary`、`action` 和 `check`。没有可引用内容时明确写“暂无足够证据”；`studentFeedback`使用“表现—证据—影响—下一步”组织，不允许“描述不完整”“加强理解”等无证据泛化评价。

`tutor_question`模式输出`{"answer":"..."}`，只能回答当前问题和必要原理，不改变步骤、不提前给后续步骤完整操作答案。
