// ─── TOAST ────────────────────────────────────────────────────────────────────

export function Toast({
  msg,
  type,
}: {
  msg: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={`mx-5 mb-3 px-4 py-2.5 rounded-[10px] text-sm font-semibold text-white flex items-center gap-2
      ${type === "success" ? "bg-[#156f48]" : "bg-[#dd2237]"}`}
    >
      <span>{type === "success" ? "✓" : "✕"}</span>
      <span>{msg}</span>
    </div>
  );
}
