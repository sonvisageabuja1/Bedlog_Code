import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";

export function LogoMediText({
  color = "#3469B2",
}: {
  color?: string;
}) {
  return (
    <div className="absolute inset-[0_0_0_40.31%]">
      <svg
        className="absolute block inset-0 size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 61.8406 41.7262"
      >
        <path d={svgPaths.p1feade00} fill={color} />
        <path d={svgPaths.p2f9b0ba0} fill={color} />
        <path d={svgPaths.p1cd56500} fill={color} />
        <path d={svgPaths.peb0edc0} fill={color} />
        <path d={svgPaths.p26e28600} fill={color} />
        <path d={svgPaths.p20cdfa00} fill={color} />
      </svg>
    </div>
  );
}
