// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
// Guards irreversible patient updates (discharge, deceased, LAMA, absconded)
// against mis-taps on the kiosk. Buttons use onClick, not onPointerDown, so
// the tap that opened the modal can't also land on Confirm or the backdrop.

export function ConfirmModal({
  title = "Are you sure you want to update this patient?",
  message,
  confirmLabel = "Confirm",
  confirmColor = "#2437b5",
  onConfirm,
  onCancel,
}: {
  title?: string;
  message?: string;
  confirmLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="bg-white rounded-[16px] w-full max-w-[520px] shadow-2xl overflow-hidden"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-[24px] pt-[24px] pb-[20px] text-center">
          <p className="font-semibold text-[#2b2b2b] text-[24px] leading-[30px]">
            {title}
          </p>
          {message && (
            <p className="mt-[10px] text-[#64748b] text-[20px] leading-[26px]">
              {message}
            </p>
          )}
        </div>
        <div className="flex gap-[8px] px-[16px] pb-[16px]">
          <button
            onClick={onCancel}
            className="flex-1 h-[64px] rounded-[8px] bg-[#f1f3f5] border border-[#e5e7eb] flex items-center justify-center active:opacity-80"
          >
            <span className="font-medium text-[#2b2b2b] text-[22px]">
              Cancel
            </span>
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-[64px] rounded-[8px] flex items-center justify-center active:opacity-80"
            style={{ backgroundColor: confirmColor }}
          >
            <span className="font-medium text-white text-[22px]">
              {confirmLabel}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
