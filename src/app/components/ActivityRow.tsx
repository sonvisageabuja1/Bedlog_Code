export function ActivityRow({
  label,
  pillBg,
  pillColor,
  count,
}: {
  label: string;
  pillBg: string;
  pillColor: string;
  count: number;
}) {
  return (
    <div className="relative rounded-[8px] w-full bg-[rgba(255,255,255,0.05)]">
      <div
        aria-hidden
        className="absolute border-[0.5px] border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[8px]"
      />
      <div className="flex flex-row items-center justify-between p-[10px]">
        {/* Pill badge */}
        <div
          className="flex items-center px-[10px] py-[4px] rounded-[100px]"
          style={{ backgroundColor: pillBg }}
        >
          <p
            className="font-bold text-[11px] leading-normal whitespace-nowrap"
            style={{
              color: pillColor,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {label}
          </p>
        </div>
        {/* Count */}
        <p
          className="font-bold text-[#0f172a] text-[13px] leading-normal"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {count}
        </p>
      </div>
    </div>
  );
}
