import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  ChartNoAxesCombined,
  CircleCheckBig,
  DatabaseZap,
  FlaskConical,
  GraduationCap,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { IntegrationStatus } from '@/lib/integration-status';

const ROUTE_STEPS = [
  '基因与引物',
  '重组载体',
  '转化与诱导',
  '表达验证',
  '纯化选择',
  '蛋白纯化',
  '纯度判断',
  '浓度与回顾',
] as const;

const AGENT_CAPABILITIES = [
  {
    icon: BrainCircuit,
    title: '带着上下文对话',
    description: '智能体持续读取当前步骤、课程知识库与历史修订，不是一次性问答。',
  },
  {
    icon: MessagesSquare,
    title: '证据化学习点评',
    description: '引用你的原文和具体学习场景，指出影响、修订动作与检查标准。',
  },
  {
    icon: BookOpenCheck,
    title: '八步文字推演',
    description: '围绕 EGFP 重组克隆主线，先写清方案、理由与案例图判断。',
  },
  {
    icon: ChartNoAxesCombined,
    title: '可追溯学习报告',
    description: '用八步证据解释五维能力、强弱项、行动计划与教师复核状态。',
  },
] as const;

interface Props {
  demo: boolean;
  chaoxing: boolean;
  authenticated?: boolean;
  displayName?: string;
  defaultWorkspace?: 'student' | 'teacher';
  integrations: IntegrationStatus;
}

function statusLabel(status: IntegrationStatus[keyof IntegrationStatus]['state']) {
  if (status === 'ready') return '已配置';
  if (status === 'fixture') return '本地夹具';
  if (status === 'configured') return '待回查';
  if (status === 'error') return '配置错误';
  return '待联调';
}

export default function HomeEntry({
  demo,
  chaoxing,
  authenticated = false,
  displayName,
  defaultWorkspace = 'student',
  integrations,
}: Props) {
  const destination = authenticated
    ? defaultWorkspace === 'teacher' ? '/teacher/dashboard' : '/student/map'
    : demo ? '/preview/student/map' : '/login';
  const actionLabel = authenticated
    ? defaultWorkspace === 'teacher' ? '进入教学工作台' : '继续文字实验'
    : demo ? '进入智能体体验' : '使用学习通身份进入';

  return (
    <div className="agent-home">
      <header className="agent-home-nav">
        <Link href="/" className="agent-brand" aria-label="珞珈生化智能体首页">
          <span className="agent-brand-mark"><FlaskConical aria-hidden /></span>
          <span><strong>珞珈生化智能体</strong><small>武汉大学生物化学文字实验</small></span>
        </Link>
        <Link href={destination} prefetch className="agent-nav-cta">
          {authenticated ? '进入工作区' : '登录'}<ArrowRight aria-hidden />
        </Link>
      </header>

      <main>
        <section className="agent-hero" aria-labelledby="agent-home-title">
          <div className="agent-hero-art" aria-hidden />
          <div className="agent-hero-content">
            <p className="agent-eyebrow"><Sparkles aria-hidden /> 武汉大学 · 生物化学课程智能体</p>
            {authenticated && <p className="agent-welcome">欢迎回来，{displayName || '同学'}</p>}
            <h1 id="agent-home-title">先用文字想清楚，<br />再走进实验室。</h1>
            <p className="agent-hero-lead">
              围绕 EGFP 重组克隆主线，与智能体完成任务理解、文字方案、案例图分析、AI 点评、修订和 Gate 检查。这里训练实验思维，不要求真实动手，也不生成真实实验数据。
            </p>
            <div className="agent-hero-actions">
              <Link href={destination} prefetch className="agent-primary-action">
                {actionLabel}<ArrowRight aria-hidden />
              </Link>
              <a href="#agent-route" className="agent-secondary-action">先看八步路线</a>
            </div>
            {!authenticated && !demo && !chaoxing && (
              <p className="agent-login-note">正式学习通登录尚未配置，当前仅展示产品说明。</p>
            )}
            <div className="agent-trust-row" aria-label="产品边界">
              <span><ShieldCheck aria-hidden />课程知识库支撑</span>
              <span><CircleCheckBig aria-hidden />逐步 Gate 检查</span>
              <span><DatabaseZap aria-hidden />修订记录可追溯</span>
            </div>
          </div>
          <aside className="agent-presence-card" aria-label="智能体工作状态">
            <span className="agent-avatar"><BrainCircuit aria-hidden /></span>
            <div><small>智能体在线</small><strong>正在等待你的学习任务</strong></div>
            <ul>
              <li><span />基于课程知识库</li>
              <li><span />读取当前步骤上下文</li>
              <li><span />保留历史修订证据</li>
            </ul>
          </aside>
        </section>

        <section className="agent-section agent-capabilities" aria-labelledby="capability-title">
          <div className="agent-section-heading">
            <p>它不只是步骤网页</p>
            <h2 id="capability-title">同一个智能体，陪学生学习，也帮助教师判断</h2>
          </div>
          <div className="agent-capability-grid">
            {AGENT_CAPABILITIES.map(({ icon: Icon, title, description }, index) => (
              <article key={title}>
                <span className={`agent-capability-icon tone-${index + 1}`}><Icon aria-hidden /></span>
                <h3>{title}</h3><p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="agent-route" className="agent-section agent-route-section" aria-labelledby="route-title">
          <div className="agent-section-heading">
            <p>固定 EGFP 学习主线</p>
            <h2 id="route-title">八步走完一场实验前文字推演</h2>
          </div>
          <ol className="agent-route-preview">
            {ROUTE_STEPS.map((title, index) => (
              <li key={title}><span>{index + 1}</span><strong>{title}</strong><small>{index < 7 ? '继续推演' : '生成报告'}</small></li>
            ))}
          </ol>
          <p className="agent-route-note">双酶切作为备选知识分支，仅在资料抽屉和知识问答中出现，不与重组克隆主线混杂。</p>
        </section>

        <section className="agent-section agent-how-it-works" aria-labelledby="flow-title">
          <div className="agent-section-heading">
            <p>三步即可开始</p>
            <h2 id="flow-title">身份自动识别，学习路径清楚可见</h2>
          </div>
          <div className="agent-flow-grid">
            <article><span><GraduationCap aria-hidden /></span><b>01</b><h3>学习通统一进入</h3><p>系统按校方稳定角色 ID 判断权限，不需要手动选择学生或教师。</p></article>
            <article><span><FlaskConical aria-hidden /></span><b>02</b><h3>与智能体推演</h3><p>学生逐步作答和修订；教师可切到独立学习体验，不计入班级数据。</p></article>
            <article><span><ChartNoAxesCombined aria-hidden /></span><b>03</b><h3>形成证据报告</h3><p>报告解释能力维度、评分依据、问题成因边界和下一步行动。</p></article>
          </div>
        </section>

        <section className="agent-boundary-note">
          <ShieldCheck aria-hidden />
          <div><strong>明确的数据边界</strong><p>本智能体只记录文字方案、案例分析、AI 评阅、Gate 和教师复核，不上传真实实验结果，也不伪造真实实验数据。</p></div>
        </section>

        <section className="agent-integration-status" aria-label="外部服务状态">
          <span>服务状态</span>
          {Object.values(integrations).map((item) => (
            <p key={item.label}><i data-state={item.state} />{item.label}<small>{statusLabel(item.state)}</small></p>
          ))}
        </section>
      </main>

      <footer className="agent-home-footer">武汉大学生物化学文字实验智能体 · 课程学习辅助</footer>
    </div>
  );
}
