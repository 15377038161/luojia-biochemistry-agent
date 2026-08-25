# 双智能体架构与运行说明

## 主链路

学生消息分为普通提问和正式提交。普通提问调用`WF-TEXT/tutor_question`，只保存对话；正式提交调用`WF-TEXT/evaluate`，服务端先校验结构，再用确定性Gate覆盖模型结论，最后通过数据库函数原子保存回答版本、评阅、步骤状态和超星待同步事件。

教师智能体不让模型计算人数。服务端按教师授权班级查询Supabase，确定性计算进度、高频遗漏和待复核记录，再把数据与证据显示在教师对话右侧。

## 数据规则

- 一次八步学习对应一个学生`agent_session`。
- `agent_messages`和`step_attempts`只新增、不覆盖。
- 当前步骤由服务端数据库函数推进，不能通过URL跳步。
- 第三次正式修改后，一般遗漏转为`teacher_review`；安全或原理Gate仍须修正。
- 学生只读取自己的消息、图片和报告；教师只能读取授权班级。
- 完整rubric和知识块不向学生RLS开放。

## 接口

学生：

- `POST /api/student/session`：创建或恢复八步会话。
- `POST /api/student/messages`：普通提问，不计正式次数。
- `POST /api/student/evaluate`：正式提交并评阅。
- `POST /api/student/image-question`：把当前步骤图片题插入对话。
- `POST /api/student/media/upload`：申请私有签名上传。
- `POST /api/student/media/evaluate`：登记图片并调用视觉工作流。
- `POST /api/student/report`：生成或读取学习情况报告。

教师：

- `POST /api/teacher/session`：创建教师智能体会话。
- `POST /api/teacher/query`：查询真实学习记录和证据。
- `POST /api/teacher/reviews`：保存复核结论或补充意见。

内部：

- `POST /api/internal/sync-chaoxing`：使用Worker Secret处理超星outbox。

所有接口返回`{ok,data,requestId}`或`{ok:false,error,requestId}`。

## 上线顺序

1. 在Coze实例化Supabase并执行迁移。
2. 配置Service Role，仅供服务端使用。
3. 运行`pnpm seed:content`。
4. 创建三个Coze工作流并配置ID、Token。
5. 用演示学生和演示教师完成验收。
6. 上传并部署Coze项目，取得HTTPS域名。
7. 在超星登记开发/正式回调，启用OAuth并关闭演示入口。
8. 获得表单正式外部接口后配置同步URL和Token。

## 尚需外部配置才能验证的能力

- Supabase远程迁移与真实RLS：需要Coze实例化后的项目凭据。
- 三个Coze工作流真实运行：需要工作流ID和服务端Token。
- 超星OAuth：需要APPID、APPKEY、武汉大学FID及已登记回调域名。
- 超星表单写入：需要学校提供正式外部调用URL、鉴权和限流规则。
