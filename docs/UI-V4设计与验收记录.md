# UI V4 设计与验收记录

## 产品与设计边界

- 产品是进入实验室前的八步文字推演训练，不要求学生真实动手或上传真实实验结果。
- 参考图只用于提取暖白水彩、科研蓝与珊瑚红、插画路线和浅色工作台语言，不复制其中虚构功能与指标。
- Figma 母版：[生物化学文字实验智能体_UI重构_V4](https://www.figma.com/design/mPOSHSeDq8u9eCrlsnLkRg)。文件包含 Foundations、Components、Student、Teacher 四页。

## V4 视觉规范

- 主背景 `#FFF9F1`，科研蓝 `#2F78C8`，深蓝文字 `#173B6B`，珊瑚红 `#F27D82`，浅青 `#7BC7DD`，生物绿 `#66C7A6`。
- 中文正文使用 Noto Sans CJK SC / 思源黑体兼容栈，展示标题使用 Noto Serif CJK SC / 思源宋体兼容栈。
- 手机正文不小于 14px，关键触控目标不小于 48×48px；桌面正文不小于 13px。
- 入口和学生地图允许插画化路线；学生任务页以阅读和连续作答为主；教师端不使用闯关视觉。
- 动画只使用 transform 与 opacity，并支持 `prefers-reduced-motion`。

## 资源说明

- `public/illustrations/biochem-hero-v4.webp`：原创无文字水彩背景，1920px 内，约 64KB。
- `public/illustrations/step-icons-v4.svg`：八个步骤的独立 SVG symbol，总计约 5KB。
- 失败的黑底贴纸生成稿未进入项目，也没有从参考截图裁切素材。

## 浏览器验收

已在真实 Chromium 页面检查以下断点，页面 `scrollWidth` 等于 `clientWidth`，无横向滚动：

- 360×800：入口页标题、边界说明、学生/教师入口。
- 390×844：入口页、学生八步地图、学生任务页、教师工作台。
- 1366×768：生产构建入口页，无横向滚动、控制台无错误。
- 1440×900：入口页与教师工作台。
- 学生任务页已验证“下一阶段 → 知识检验 → 两题正确 → 解锁下一阶段”。
- 手机任务页底部操作栏固定在安全区域；禁用、当前、通过和待修订状态均有文字与颜色双重表达。

截图证据：

- `docs/evidence/v4-home-mobile-360x800.png`
- `docs/evidence/v4-home-mobile-390x844.png`
- `docs/evidence/v4-home-desktop-1440x900.png`
- `docs/evidence/v4-home-desktop-1366x768-production.png`
- `docs/evidence/v4-map-mobile-390x844.png`
- `docs/evidence/v4-step-mobile-390x844.png`
- `docs/evidence/v4-teacher-mobile-390x844.png`
- `docs/evidence/v4-teacher-desktop-1440x900.png`

## Coze 交付边界

- V4 未改变 Supabase 表结构、Coze 工作流输入输出、八步状态、Gate 判定和教师复核接口。
- 上传包必须排除 `.env*`、密钥、Git 历史、依赖与构建缓存。
- 本次只生成本地可上传交付包，不直接更新线上 Coze。
