import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";

export function LogoBlueName({
  color = "#3469B2",
}: {
  color?: string;
}) {
  return (
    <div className="absolute inset-[34.59%_4.58%_33.73%_40.34%]">
      <svg
        className="absolute block inset-0 size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 57.0714 13.2219"
      >
        <path d={svgPaths.p28795200} fill={color} />
        <path d={svgPaths.p7ccb200} fill={color} />
        <path d={svgPaths.p2417be00} fill={color} />
        <path d={svgPaths.p18b7b300} fill={color} />
        <path d={svgPaths.p36881e00} fill={color} />
        <path d={svgPaths.p2aaf3c00} fill={color} />
      </svg>
    </div>
  );
}
