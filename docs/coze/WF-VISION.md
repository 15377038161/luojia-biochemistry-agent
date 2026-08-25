# WF-VISION节点契约

输入：`mode`、`image_url`、`step_id`和`checks`。

节点顺序：开始 → 图片可访问性 → 清晰度/遮挡判断 → 当前步骤相关性 → 可见证据提取 → 教师标签比对 → 局限与置信度 → 结构化结束。

输出至少包含`studentFeedback`、`quality`、`relevance`、`visibleEvidence`、`limitations`、`confidence`和`requiresTeacherReview`。不能凭外观确定不可见的仪器型号、内部参数或定量结果；凝胶图缺Marker、泳道定义或教师标准时不得强行下结论。
