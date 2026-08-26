# UI V7 浏览器验收证据

## 已修正的问题

1. 首页、登录和学生／教师工作区使用同一套颜色、字体、圆角和控件尺度。
2. `/preview/*` 不再渲染平行页面，只跳转到正式路由的开发预览状态。
3. 学生地图、步骤和报告复用同一个顶部导航组件。
4. 地图节点外层悬浮前后坐标、宽高和 transform 保持一致，不再因命中区域移动产生抖动。
5. 手机地图改为完整宽度的纵向路线卡，去除交错旋转和不一致的卡片尺寸。
6. 步骤页移除桌面重复侧栏导航，保留顶部页头、五阶段导航和底部操作栏。

## 截图

- `01-home-mobile-before.png`：首页重构前；
- `02-login-mobile-before.png`：登录重构前；
- `03-map-mobile-before.png`：地图重构前；
- `04-step-mobile-before.png`：任务页重构前；
- `06-map-mobile-after.png`：地图重构后；
- `07-map-desktop-after.png`：桌面地图重构后；
- `08-step-mobile-after.png`：任务页重构后；
- `09-report-mobile-after.png`：报告页重构后；
- `10-home-mobile-after.png`：统一首页重构后；
- `11-login-mobile-after.png`：统一登录页重构后；
- `12-teacher-mobile-after.png`：教师工作台手机端；
- `13-teacher-desktop-after.png`：教师工作台桌面端。

## 验证结果

- 390×844：首页、登录、地图、步骤、报告和教师端均为 `scrollWidth === clientWidth`；
- 1440×900：教师工作台无横向滚动；
- `pnpm validate`：通过；
- `pnpm test`：14/14 通过；
- `pnpm exec next build`：38 个页面和接口路由构建通过；
- `pnpm bundle`：密钥扫描通过，交付包不含 `.env`、依赖、Git 历史和构建缓存。

## 地图稳定性证据

1440×900 视口中，步骤1节点悬浮前后测量结果一致：

```text
x = 169.4149
y = 391.7110
width = 197.9942
height = 85.3945
transform = matrix(1, 0, 0, 1, -98.9971, -42.6973)
```

外层节点不再移动，悬浮反馈仅作用于内部插画。
