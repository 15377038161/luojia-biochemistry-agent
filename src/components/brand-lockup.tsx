import Image from 'next/image';

interface Props {
  compact?: boolean;
  decorative?: boolean;
  showChaoxing?: boolean;
}

export default function BrandLockup({ compact = false, decorative = false, showChaoxing = true }: Props) {
  const whuAlt = decorative ? '' : '武汉大学';
  const chaoxingAlt = decorative ? '' : '学习通';

  return (
    <span
      className={`brand-lockup${compact ? ' is-compact' : ''}${showChaoxing ? '' : ' is-whu-only'}`}
      aria-label={decorative ? undefined : showChaoxing ? '武汉大学与学习通' : '武汉大学'}
    >
      <span className="brand-lockup-whu">
        <Image
          src="/brand/wuhan-university-emblem.png"
          alt={whuAlt}
          width={52}
          height={52}
          priority={!compact}
        />
      </span>
      {showChaoxing && (
        <span className="brand-lockup-chaoxing">
          <Image
            src="/brand/xuexitong-icon.jpg"
            alt={chaoxingAlt}
            width={34}
            height={34}
          />
        </span>
      )}
    </span>
  );
}
