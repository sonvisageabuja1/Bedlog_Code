import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";

// ─── SONVISAGE LOGO ──────────────────────────────────────────────────────────
// Built from the same Figma-exported wordmark paths that LogoTopText uses for
// the tiny "sonvisage" line above the Mediboards logo. The circular mark reuses
// the wordmark's opening "s" swoosh (pf4b7300) in white on a brand-blue disc.

const WORDMARK_PATHS = [
  svgPaths.p2d295500,
  svgPaths.p35b03e00,
  svgPaths.p1d9ad00,
  svgPaths.p3fd16080,
  svgPaths.p251f7400,
  svgPaths.p8b8e700,
  svgPaths.p2e2eeb40,
  svgPaths.pa538d00,
  svgPaths.p641e480,
  svgPaths.pf4b7300,
];

// Bounding box of the "s" swoosh inside the wordmark's viewBox.
const S_BOX = { x: 0, y: 1.34, w: 1.87, h: 5.41 };

export function SonvisageMark({
  size = 146,
  color = "#3469b2",
}: {
  size?: number;
  color?: string;
}) {
  const sHeight = size * 0.58;
  const sWidth = (sHeight * S_BOX.w) / S_BOX.h;
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <svg
        style={{ width: sWidth, height: sHeight }}
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`${S_BOX.x} ${S_BOX.y} ${S_BOX.w} ${S_BOX.h}`}
      >
        <path d={svgPaths.pf4b7300} fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export function SonvisageWordmark({
  width = 560,
  color = "#3469b2",
}: {
  width?: number;
  color?: string;
}) {
  const height = (width * 8.16271) / 39.4893;
  return (
    <svg
      style={{ width, height }}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 39.4893 8.16271"
    >
      {WORDMARK_PATHS.map((d, i) => (
        <path key={i} d={d} fill={color} />
      ))}
    </svg>
  );
}
