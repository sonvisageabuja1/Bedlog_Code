import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";

// ─── LOGO — from Figma design, using imported SVG paths ───────────────────────

export function LogoFlame() {
  return (
    <div className="absolute inset-[28.65%_59.22%_33.73%_32.1%]">
      <div className="absolute inset-[-1.27%_-0.22%_-0.13%_-0.22%]">
        <svg
          className="block size-full"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 9.035 15.9171"
        >
          <path d={svgPaths.p164f3b80} fill="#FF7F0B" />
          <path
            d={svgPaths.p26d7e000}
            stroke="#FF7F0B"
            strokeWidth="0.0399472"
          />
          <path
            d={svgPaths.p15880c00}
            fill="#FF7F0B"
            stroke="#FF7F0B"
            strokeWidth="0.399472"
          />
        </svg>
      </div>
    </div>
  );
}
