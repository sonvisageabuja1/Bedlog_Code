export function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wider">
        {label}
      </p>
      <p className="text-[13px] font-medium text-[#1c1c1e]">
        {value}
      </p>
    </div>
  );
}
