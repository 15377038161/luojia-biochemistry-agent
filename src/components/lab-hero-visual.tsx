export default function LabHeroVisual() {
  return (
    <div className="lab-hero-visual" aria-label="EGFP 荧光蛋白实验插画" role="img">
      <div className="lab-hero-grid" aria-hidden />
      <div className="lab-hero-label" aria-hidden>
        <span>EGFP · TEXT LAB</span>
        <small>珞珈山小实验家计划</small>
      </div>
      <svg viewBox="0 0 620 520" aria-hidden>
        <defs>
          <linearGradient id="lab-liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b8ffe0" />
            <stop offset=".42" stopColor="#57e8a2" />
            <stop offset="1" stopColor="#159967" />
          </linearGradient>
          <radialGradient id="lab-glow">
            <stop offset="0" stopColor="#78f5b8" stopOpacity=".46" />
            <stop offset="1" stopColor="#78f5b8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse className="lab-hero-aura" cx="315" cy="350" rx="210" ry="155" fill="url(#lab-glow)" />
        <path className="lab-hero-bench" d="M64 438H556" />
        <g className="lab-hero-flask">
          <path d="M270 92h80v121l108 190a26 26 0 0 1-23 39H185a26 26 0 0 1-23-39l108-190z" fill="rgba(7,29,54,.42)" stroke="rgba(220,255,242,.82)" strokeWidth="4" />
          <path d="M270 92h80" stroke="#f4fff9" strokeWidth="8" strokeLinecap="round" />
          <path d="M214 338h192l52 65a26 26 0 0 1-23 39H185a26 26 0 0 1-23-39z" fill="url(#lab-liquid)" />
          <ellipse cx="310" cy="338" rx="96" ry="12" fill="#d8ffec" opacity=".9" />
          <g className="lab-hero-bubbles" fill="#ecfff6">
            <circle cx="276" cy="379" r="7" /><circle cx="330" cy="405" r="5" /><circle cx="354" cy="365" r="4" />
            <circle cx="300" cy="304" r="6" /><circle cx="332" cy="278" r="4" /><circle cx="310" cy="246" r="3" />
          </g>
        </g>
        <g className="lab-hero-cells" fill="none" stroke="#8ed7f0" strokeWidth="3">
          <circle cx="102" cy="150" r="31" /><circle cx="102" cy="150" r="11" />
          <path d="M77 150h50M102 125v50" opacity=".42" />
          <circle cx="514" cy="116" r="22" /><circle cx="514" cy="116" r="7" />
        </g>
        <g className="lab-hero-tubes">
          <path d="M490 286h34v135a17 17 0 0 1-34 0z" fill="rgba(7,29,54,.55)" stroke="#91d7ee" strokeWidth="3" />
          <path d="M494 370h26v51a13 13 0 0 1-26 0z" fill="#f3b8c5" />
          <path d="M532 314h28v107a14 14 0 0 1-28 0z" fill="rgba(7,29,54,.55)" stroke="#91d7ee" strokeWidth="3" />
          <path d="M536 384h20v37a10 10 0 0 1-20 0z" fill="#efbf54" />
        </g>
      </svg>
      <div className="lab-hero-stats" aria-hidden>
        <span><b>08</b><small>实验关卡</small></span>
        <span><b>05</b><small>能力维度</small></span>
      </div>
      <span className="lab-hero-cherry blossom-one" aria-hidden>✿</span>
      <span className="lab-hero-cherry blossom-two" aria-hidden>✿</span>
    </div>
  );
}
