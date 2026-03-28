type PixelAvatarProps = {
  skillLabel: string;
  level: number;
};

/**
 * CSS-only 8-bit avatar. Swap tier palettes by level (1–5).
 */
export default function PixelAvatar({ skillLabel, level }: PixelAvatarProps) {
  const tier = Math.min(5, Math.max(1, level));
  return (
    <div
      className={`pixel-avatar pixel-avatar--tier-${tier}`}
      aria-label={`${skillLabel} avatar, level ${level}`}
    >
      <div className="pixel-avatar__stage">
        <div className="pixel-avatar__shadow" />
        <div className="pixel-avatar__sprite">
          <div className="pixel-avatar__hat" />
          <div className="pixel-avatar__head" />
          <div className="pixel-avatar__body" />
          <div className="pixel-avatar__apron" />
          <div className="pixel-avatar__legs" />
        </div>
      </div>
      <p className="pixel-avatar__caption">
        {skillLabel} · Lv.{level}
      </p>
    </div>
  );
}
