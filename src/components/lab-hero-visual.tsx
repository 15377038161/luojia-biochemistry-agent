import Image from 'next/image';

export default function LabHeroVisual() {
  return (
    <div className="lab-hero-visual" aria-label="EGFP 荧光蛋白实验插画" role="img">
      <Image
        src="/illustrations/biochem-hero-cartoon-v4.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 767px) calc(100vw - 28px), 540px"
        className="lab-hero-image"
      />
      <div className="lab-hero-grid" aria-hidden />
      <div className="lab-hero-glow" aria-hidden />
      <div className="lab-hero-bubbles" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="lab-hero-orbit" aria-hidden><i /><i /><i /></div>
      <div className="lab-hero-shimmer" aria-hidden />
      <div className="lab-hero-petals" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="lab-hero-label" aria-hidden>
        <span>EGFP · TEXT LAB</span>
        <small>珞珈山小实验家计划</small>
      </div>
      <div className="lab-hero-stats" aria-hidden>
        <span><b>08</b><small>实验关卡</small></span>
        <span><b>05</b><small>能力维度</small></span>
      </div>
    </div>
  );
}
