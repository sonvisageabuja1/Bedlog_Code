export function StatCard({
  iconBg,
  dotColor,
  label,
  value,
}: {
  iconBg: string;
  dotColor: string;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white flex-1 min-w-0 relative rounded-[12px]">
      <div
        aria-hidden
        className="absolute border border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[12px]"
      />
      <div className="flex flex-row items-center p-[16px] gap-[16px]">
        {/* Circle icon — 44px rounded full, colored dot inside */}
        <div className="relative shrink-0 size-[44px]">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            viewBox="0 0 44 44"
          >
            <rect
              fill={iconBg}
              height="44"
              rx="22"
              width="44"
            />
            <circle cx="22" cy="22" fill={dotColor} r="6" />
          </svg>
        </div>
        {/* Label + number */}
        <div
          className="flex flex-col gap-[4px] items-start"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <p className="font-semibold text-[#64748b] text-[13px] leading-normal whitespace-nowrap">
            {label}
          </p>
          <p className="font-bold text-[#0f172a] text-[28px] leading-none">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
