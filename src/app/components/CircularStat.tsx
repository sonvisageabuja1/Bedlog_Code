// ─── CIRCULAR STAT (dynamic, matches new design) ──────────────────────────────

export function CircularStat({
  value,
  total,
  ringColor,
  isFull = false,
  size = 79.577,
}: {
  value: number;
  total: number;
  ringColor: string;
  isFull?: boolean;
  size?: number;
}) {
  const bgVB = 75.3007;
  const prVB = 73.1105;
  const bgR = (bgVB - 7.30066) / 2;
  const prR = (prVB - 5.11046) / 2;
  const circ = 2 * Math.PI * prR;
  const pct = isFull
    ? 1
    : total > 0
      ? Math.min(value / total, 1)
      : 0;
  const dashoffset = circ * (1 - pct);
  const fontSize = Math.round((size / 79.577) * 24);

  return (
    <div
      className="relative shrink-0"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {/* Background ring */}
      <div className="absolute" style={{ inset: "-5.37%" }}>
        <svg
          className="block size-full"
          fill="none"
          viewBox={`0 0 ${bgVB} ${bgVB}`}
        >
          <circle
            cx={bgVB / 2}
            cy={bgVB / 2}
            r={bgR}
            stroke={ringColor}
            strokeOpacity="0.1"
            strokeWidth="7.30066"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {/* Progress arc */}
      <div className="absolute" style={{ inset: "-3.76%" }}>
        <svg
          className="block size-full"
          fill="none"
          viewBox={`0 0 ${prVB} ${prVB}`}
        >
          <circle
            cx={prVB / 2}
            cy={prVB / 2}
            r={prR}
            stroke={ringColor}
            strokeWidth="5.11046"
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${prVB / 2} ${prVB / 2})`}
          />
        </svg>
      </div>
      {/* Value — colored to match ring, scales with size */}
      <p
        className="absolute font-bold leading-none text-center"
        style={{
          fontSize: `${fontSize}px`,
          color: ringColor,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {value}
      </p>
    </div>
  );
}
