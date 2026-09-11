import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";

export function LogoTopText({
  color = "#3469B2",
}: {
  color?: string;
}) {
  return (
    <div className="absolute inset-[10%_61.89%_70.44%_0]">
      <svg
        className="absolute block inset-0 size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 39.4893 8.16271"
      >
        <path d={svgPaths.p2d295500} fill={color} />
        <path d={svgPaths.p35b03e00} fill={color} />
        <path d={svgPaths.p1d9ad00} fill={color} />
        <path d={svgPaths.p3fd16080} fill={color} />
        <path d={svgPaths.p251f7400} fill={color} />
        <path d={svgPaths.p8b8e700} fill={color} />
        <path d={svgPaths.p2e2eeb40} fill={color} />
        <path d={svgPaths.pa538d00} fill={color} />
        <path d={svgPaths.p641e480} fill={color} />
        <path d={svgPaths.pf4b7300} fill={color} />
      </svg>
    </div>
  );
}
