import type { Ward } from "../types";

// ─── WARD DETAILS MODAL (view-only) ────────────────────────────────────────
// Ward data comes exclusively from Mediboard now — BedLog never creates or
// edits a ward (see mediboard_open_questions memory, item 10's resolution,
// 2026-09-01). Editing here used to only ever update local state, with no
// way to actually push it to Mediboard (`pushWardChanges` was a permanent
// stub) — silently drifting out of sync with the real data. This is a pure
// read-only view instead, so there's nothing left to conflict.

export function WardModal({
  ward,
  onClose,
}: {
  ward: Ward;
  onClose: () => void;
}) {
  const fieldClass =
    "bg-[#f4f6f9] h-[40px] rounded-[10px] border-[0.726px] border-[rgba(0,0,0,0.1)] px-[13px] flex items-center text-[12px] text-[#0f172a] opacity-50 cursor-not-allowed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
      onPointerDown={onClose}
    >
      <div
        className="bg-[#f7f7f7] rounded-[16px] w-full overflow-hidden shadow-2xl flex flex-col"
        style={{ maxWidth: "420px" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-[10px] py-[8px] border-b border-[rgba(0,0,0,0.08)]">
          <div className="w-[20px]" />
          <p
            className="flex-1 text-center font-semibold text-[#2b2b2b] text-[16px] leading-[26px]"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Ward Details
          </p>
          <button
            onPointerDown={onClose}
            className="shrink-0 size-[20px] flex items-center justify-center active:opacity-60"
          >
            <svg
              width="12.5"
              height="12.5"
              fill="none"
              viewBox="0 0 12.5 12.5"
            >
              <path
                d="M11.875 0.625L0.625 11.875"
                stroke="#2B2B2B"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              />
              <path
                d="M11.875 11.875L0.625 0.625"
                stroke="#2B2B2B"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              />
            </svg>
          </button>
        </div>

        {/* Details section */}
        <div className="px-[8px] pt-[8px] flex flex-col gap-[4px]">
          <p
            className="font-semibold text-[#282828] text-[16px] leading-[26px]"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Details
          </p>
          <p
            className="text-[#6c6c6c] text-[12px] leading-[20px]"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 500,
            }}
          >
            Managed from Mediboard — not editable on this device.
          </p>
        </div>

        {/* Read-only details card */}
        <div className="bg-white rounded-[12px] mx-[8px] my-[8px] p-[16px] flex flex-col gap-[10px]">
          <div className="flex flex-col gap-[8px]">
            <p
              className="font-semibold text-[#2b2b2b] text-[12px] tracking-[0.3px]"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Name
            </p>
            <div className={fieldClass}>{ward.name}</div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <p
              className="font-semibold text-[#2b2b2b] text-[12px] tracking-[0.3px]"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Ward/Section
            </p>
            <div className={fieldClass}>{ward.floor || "—"}</div>
          </div>

          <div className="flex gap-[10px]">
            <div className="flex flex-col gap-[8px] flex-[2]">
              <p
                className="font-semibold text-[#2b2b2b] text-[12px] tracking-[0.3px]"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Capacity
              </p>
              <div className={fieldClass}>{ward.capacity}</div>
            </div>
            <div className="flex flex-col gap-[8px] flex-1">
              <p
                className="font-semibold text-[#2b2b2b] text-[12px] tracking-[0.3px]"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Code
              </p>
              <div className={`${fieldClass} font-semibold uppercase`}>
                {ward.code || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Close */}
        <div className="px-[8px] pb-[8px]">
          <button
            onPointerDown={onClose}
            className="w-full h-[50px] rounded-[8px] border border-[#3469b2] flex items-center justify-center active:opacity-80"
            style={{ backgroundColor: "#3469b2" }}
          >
            <span
              className="font-semibold text-white text-[16px] leading-[26px]"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
