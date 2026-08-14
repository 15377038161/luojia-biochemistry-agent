from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1920, 1080
BG = "#F4F8FC"
NAVY = "#123B66"
BLUE = "#1769AA"
CYAN = "#2D9CDB"
GOLD = "#C79A2B"
GREEN = "#14866D"
RED = "#C44B4B"
TEXT = "#18324A"
MUTED = "#62778B"
LINE = "#AFC3D6"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf" if bold else r"C:\Windows\Fonts\simsun.ttc"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


F_TITLE = font(46, True)
F_SUBTITLE = font(24)
F_H2 = font(29, True)
F_BODY = font(23)
F_SMALL = font(19)
F_TINY = font(16)
F_LABEL = font(21, True)


def canvas(title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((48, 36, W - 48, H - 36), radius=30, fill=WHITE, outline="#DCE7F1", width=2)
    draw.rectangle((48, 36, W - 48, 150), fill=NAVY)
    draw.text((90, 60), title, fill=WHITE, font=F_TITLE)
    draw.text((92, 119), subtitle, fill="#CFE4F8", font=F_SUBTITLE)
    return img, draw


def rbox(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], title: str, lines: list[str], *, fill: str = "#EFF6FC", stroke: str = BLUE, badge: str | None = None) -> None:
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=22, fill=fill, outline=stroke, width=3)
    if badge:
        draw.rounded_rectangle((x1 + 20, y1 + 18, x1 + 70, y1 + 62), radius=12, fill=stroke)
        draw.text((x1 + 37, y1 + 25), badge, fill=WHITE, font=F_SMALL, anchor="mm")
        tx = x1 + 86
    else:
        tx = x1 + 24
    draw.text((tx, y1 + 22), title, fill=TEXT, font=F_H2)
    yy = y1 + 76
    for line in lines:
        draw.text((x1 + 26, yy), "• " + line, fill=MUTED, font=F_SMALL)
        yy += 34


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], label: str = "", color: str = BLUE, width: int = 5, dashed: bool = False) -> None:
    x1, y1 = start
    x2, y2 = end
    if dashed:
        steps = 20
        for i in range(0, steps, 2):
            xa = x1 + (x2 - x1) * i / steps
            ya = y1 + (y2 - y1) * i / steps
            xb = x1 + (x2 - x1) * min(i + 1, steps) / steps
            yb = y1 + (y2 - y1) * min(i + 1, steps) / steps
            draw.line((xa, ya, xb, yb), fill=color, width=width)
    else:
        draw.line((x1, y1, x2, y2), fill=color, width=width)
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 16
    p1 = (x2 - size * math.cos(angle - 0.55), y2 - size * math.sin(angle - 0.55))
    p2 = (x2 - size * math.cos(angle + 0.55), y2 - size * math.sin(angle + 0.55))
    draw.polygon([(x2, y2), p1, p2], fill=color)
    if label:
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        bbox = draw.textbbox((0, 0), label, font=F_TINY)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.rounded_rectangle((mx - tw // 2 - 9, my - th // 2 - 6, mx + tw // 2 + 9, my + th // 2 + 6), radius=8, fill=WHITE, outline="#D8E3ED")
        draw.text((mx, my), label, fill=TEXT, font=F_TINY, anchor="mm")


def save(img: Image.Image, name: str) -> None:
    img.save(OUT / name, "PNG", optimize=True)


def architecture() -> None:
    img, d = canvas("超星统一身份与数据同步整体架构", "业务系统不直接连接超星底层数据库；统一通过已授权接口、表单或任务流交换数据")
    rbox(d, (90, 240, 400, 480), "学生 / 教师", ["从学习通或应用入口进入", "使用统一账号完成身份识别", "只访问本人或授权课程数据"], fill="#FFF9EC", stroke=GOLD, badge="1")
    rbox(d, (540, 190, 940, 520), "Coze 全栈业务系统", ["Next.js 页面与服务端 API", "OAuth 回调与安全会话", "实验状态机、评分与报告", "超星接口适配器与同步队列"], fill="#EEF6FF", stroke=BLUE, badge="2")
    rbox(d, (1090, 190, 1510, 400), "超星身份认证中心", ["签发一次性 code", "换取 access_token / refresh_token", "返回用户、单位与角色信息"], fill="#F0FBF8", stroke=GREEN, badge="3")
    rbox(d, (1090, 500, 1510, 750), "超星开放能力", ["经授权的用户/课程/成绩接口", "微服务表单与任务流", "正式字段、签名、限流以授权文档为准"], fill="#FFF4F2", stroke=RED, badge="4")
    rbox(d, (540, 650, 940, 895), "业务数据库（Supabase）", ["业务用户与外部身份映射", "实验过程、答案版本、AI评阅", "同步 outbox、审计与重试状态"], fill="#F3F0FF", stroke="#6F58B5", badge="5")
    rbox(d, (90, 650, 400, 895), "Coze AI 工作流", ["文字评阅与分层提示", "图片/仪器辅助识别", "学习情况与改进报告"], fill="#F1FAFD", stroke=CYAN, badge="6")
    arrow(d, (400, 330), (540, 330), "HTTPS 访问")
    arrow(d, (940, 280), (1090, 280), "授权跳转 / code")
    arrow(d, (1090, 350), (940, 350), "token / 用户信息", GREEN)
    arrow(d, (940, 680), (1090, 620), "授权 API / 表单同步", RED)
    arrow(d, (740, 520), (740, 650), "事务读写")
    arrow(d, (540, 775), (400, 775), "受控 AI 请求", CYAN)
    d.rounded_rectangle((1545, 190, 1830, 750), radius=22, fill="#F8FAFC", outline=LINE, width=2)
    d.text((1570, 220), "链路说明", fill=TEXT, font=F_H2)
    notes = [
        "① 用户进入业务系统",
        "② 未登录时发起 OAuth",
        "③ 服务端换 token 并取用户",
        "④ 映射业务用户与角色",
        "⑤ 业务先落本地事务库",
        "⑥ outbox 异步同步超星",
        "⑦ AI不接触密钥和无关身份",
        "⑧ 失败可重试、可审计",
    ]
    y = 280
    for n in notes:
        d.text((1570, y), n, fill=MUTED, font=F_SMALL)
        y += 50
    d.rounded_rectangle((90, 940, 1830, 1018), radius=18, fill="#FFF7E5", outline=GOLD, width=2)
    d.text((120, 966), "关键边界：超星“统一数据库”在本方案中指由超星承载的数据能力；第三方应用不直接获得底层数据库连接账号。", fill="#765714", font=F_LABEL)
    save(img, "01-system-architecture-1920x1080.png")


def oauth_flow() -> None:
    img, d = canvas("超星 OAuth 2.0 授权码登录全链路", "code 一次性使用且 5 分钟过期；APPKEY、access_token、refresh_token 全程只在服务端保存")
    actors = [(230, "用户浏览器", GOLD), (690, "Coze / Next.js 后端", BLUE), (1160, "超星认证中心", GREEN), (1610, "业务数据库", "#6F58B5")]
    for x, name, color in actors:
        d.rounded_rectangle((x - 150, 180, x + 150, 245), radius=16, fill=WHITE, outline=color, width=3)
        d.text((x, 212), name, fill=TEXT, font=F_LABEL, anchor="mm")
        d.line((x, 245, x, 980), fill="#C9D5E1", width=3)
    steps = [
        (290, 230, 690, "1. 打开业务系统"),
        (355, 690, 230, "2. 302 跳转授权地址，携带 appid / redirect_uri / state"),
        (430, 230, 1160, "3. 用户已登录则授权；未登录先进入泛雅登录"),
        (505, 1160, 230, "4. 回调 redirect_uri?code=...&state=..."),
        (580, 230, 690, "5. 浏览器把回调交给后端"),
        (655, 690, 1160, "6. POST code + appid + secret 换 token"),
        (730, 1160, 690, "7. 返回 access_token / refresh_token / openid / expires_time"),
        (805, 690, 1160, "8. 服务端携 token 获取 uid、学工号、fid、roles"),
        (880, 690, 1610, "9. 校验 fid / role，绑定业务用户并建立安全会话"),
        (955, 690, 230, "10. 设置 HttpOnly 会话 Cookie，进入学生或教师页面"),
    ]
    for y, x1, x2, label in steps:
        color = BLUE if x2 >= x1 else GREEN
        arrow(d, (x1, y), (x2, y), label, color=color, width=4)
    d.rounded_rectangle((104, 990, 1816, 1040), radius=14, fill="#FFF2F2", outline=RED, width=2)
    d.text((960, 1015), "校验失败处理：state 不一致、code 复用/过期、fid 不在白名单、角色不满足时，立即终止登录且不创建业务会话。", fill="#8E3131", font=F_SMALL, anchor="mm")
    save(img, "02-oauth-flow-1920x1080.png")


def data_sequence() -> None:
    img, d = canvas("业务数据与超星数据能力的可靠同步时序", "采用本地事务 + outbox + 幂等键；超星接口失败不回滚已经完成的学生业务操作")
    actors = [(230, "业务 API", BLUE), (610, "Supabase 事务库", "#6F58B5"), (990, "同步 Worker", CYAN), (1370, "超星开放接口 / 任务流", RED), (1710, "监控与审计", GOLD)]
    for x, name, color in actors:
        d.rounded_rectangle((x - 145, 180, x + 145, 245), radius=16, fill=WHITE, outline=color, width=3)
        d.text((x, 212), name, fill=TEXT, font=F_LABEL, anchor="mm")
        d.line((x, 245, x, 965), fill="#C9D5E1", width=3)
    rows = [
        (300, 230, 610, "1. 写业务数据 + request_id"),
        (370, 610, 610, "2. 同一事务写 sync_outbox=pending"),
        (440, 610, 230, "3. 提交成功，立即响应用户"),
        (520, 990, 610, "4. 拉取待同步事件并加锁"),
        (590, 990, 1370, "5. 规范化字段、鉴权、发送幂等键"),
        (660, 1370, 990, "6. 返回成功 / 业务错误 / 429 / 5xx"),
        (730, 990, 610, "7. 成功→synced；失败→next_retry_at"),
        (800, 990, 1710, "8. 记录耗时、错误码、重试次数"),
        (880, 990, 1370, "9. 指数退避重试；超阈值转人工处理"),
    ]
    for y, x1, x2, label in rows:
        if x1 == x2:
            d.arc((x1 - 58, y - 24, x1 + 58, y + 45), 60, 300, fill="#6F58B5", width=4)
            d.text((x1 + 85, y + 5), label, fill=TEXT, font=F_TINY)
        else:
            arrow(d, (x1, y), (x2, y), label, color=RED if 1370 in (x1, x2) else BLUE, width=4)
    d.rounded_rectangle((90, 975, 1830, 1035), radius=14, fill="#EFF9F6", outline=GREEN, width=2)
    d.text((960, 1005), "查询同步采用游标/更新时间戳增量拉取；写入以 source + event_id 唯一约束去重；冲突按字段所有权解决。", fill="#176B59", font=F_SMALL, anchor="mm")
    save(img, "03-data-sync-sequence-1920x1080.png")


def deployment() -> None:
    img, d = canvas("Coze 部署与超星回调地址配置", "预览域名与正式域名必须分别登记；同一套代码通过环境变量切换，不把密钥打进 release 压缩包")
    rbox(d, (100, 230, 470, 520), "本地开发", ["pnpm install / pnpm dev", "127.0.0.1:5000", "仅用于本机联调", "使用测试环境变量"], fill="#F4F8FC", stroke=BLUE, badge="A")
    rbox(d, (620, 210, 1030, 540), "Coze 预览环境", ["上传 release 压缩包", "*.dev.coze.site", "配置开发环境变量", "登记开发回调地址"], fill="#EEF6FF", stroke=CYAN, badge="B")
    rbox(d, (1180, 210, 1590, 540), "Coze 正式环境", ["*.coze.site", "配置生产环境变量", "关闭 DEMO 模式", "登记生产回调地址"], fill="#F0FBF8", stroke=GREEN, badge="C")
    rbox(d, (620, 700, 1030, 925), "超星开放平台应用", ["保存 APPID / APPKEY", "配置两套 HTTPS 回调", "限定允许登录的 fid", "审核通过后正式启用"], fill="#FFF9EC", stroke=GOLD, badge="D")
    arrow(d, (470, 360), (620, 360), "pnpm run bundle")
    arrow(d, (1030, 360), (1180, 360), "测试通过后部署", GREEN)
    arrow(d, (825, 540), (825, 700), "开发回调", CYAN)
    arrow(d, (1385, 540), (1030, 810), "生产回调", GREEN)
    d.rounded_rectangle((1635, 210, 1820, 925), radius=20, fill="#F8FAFC", outline=LINE, width=2)
    d.text((1727, 250), "回调格式", fill=TEXT, font=F_H2, anchor="mm")
    small_lines = [
        "开发：",
        "https://{id}",
        ".dev.coze.site",
        "/api/auth/callback/",
        "chaoxing",
        "",
        "生产：",
        "https://{name}",
        ".coze.site",
        "/api/auth/callback/",
        "chaoxing",
    ]
    y = 320
    for line in small_lines:
        d.text((1658, y), line, fill=MUTED if line else WHITE, font=F_TINY)
        y += 42
    d.rounded_rectangle((100, 960, 1590, 1028), radius=15, fill="#FFF2F2", outline=RED, width=2)
    d.text((130, 982), "生产检查：Secret 只进服务端环境变量；回调域名完全匹配；HTTPS 生效；日志脱敏；教师演示入口关闭。", fill="#8E3131", font=F_LABEL)
    save(img, "04-deployment-topology-1920x1080.png")


def upscale_screenshots() -> None:
    for src_name, dst_name in [
        ("chaoxing-oauth-code-official.jpg", "05-chaoxing-oauth-code-official-1920x1080.png"),
        ("chaoxing-access-token-official.jpg", "06-chaoxing-access-token-official-1920x1080.png"),
    ]:
        src = Image.open(OUT / src_name).convert("RGB")
        src = src.filter(ImageFilter.UnsharpMask(radius=1.2, percent=135, threshold=2))
        scaled = src.resize((W, H), Image.Resampling.LANCZOS)
        scaled.save(OUT / dst_name, "PNG", optimize=True)


if __name__ == "__main__":
    architecture()
    oauth_flow()
    data_sequence()
    deployment()
    upscale_screenshots()
    for path in sorted(OUT.glob("*.png")):
        print(f"{path.name}: {Image.open(path).size}")
