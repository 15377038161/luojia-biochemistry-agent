import Image from 'next/image';

interface Props {
  compact?: boolean;
  decorative?: boolean;
}

export default function BrandLockup({ compact = false, decorative = false }: Props) {
  const whuAlt = decorative ? '' : '武汉大学';
  const chaoxingAlt = decorative ? '' : '学习通';

  return (
    <span className={`brand-lockup${compact ? ' is-compact' : ''}`} aria-label={decorative ? undefined : '武汉大学与学习通'}>
      <span className="brand-lockup-whu">
        <Image
          src="/brand/wuhan-university-emblem.png"
          alt={whuAlt}
          width={52}
          height={52}
          priority={!compact}
        />
      </span>
      <span className="brand-lockup-chaoxing">
        <Image
          src="/brand/xuexitong-icon.jpg"
          alt={chaoxingAlt}
          width={34}
          height={34}
        />
      </span>
    </span>
  );
}
