import { useEffect } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

// ─── TOAST ────────────────────────────────────────────────────────────────────
// Fixed top-right, just under the top bar, above every modal (z-[60]) so
// feedback from an action taken inside a modal is still visible. Dismisses
// itself after TOAST_DURATION; callers should pass a fresh `key` per toast so
// a new message restarts the timer instead of inheriting the old one.

export const TOAST_DURATION = 4000;

export type ToastType = "success" | "error";

// Headline shown for admissions; every other success uses the default
// ("Patient updated successfully") from STYLES.
export const ADMITTED_TITLE = "Patient admitted successfully";

const STYLES: Record<
  ToastType,
  { accent: string; bg: string; title: string; Icon: typeof CircleCheck }
> = {
  success: {
    accent: "#156f48",
    bg: "#f0fdf4",
    title: "Patient updated successfully",
    Icon: CircleCheck,
  },
  error: {
    accent: "#dd2237",
    bg: "#fef2f2",
    title: "Error",
    Icon: CircleAlert,
  },
};

export function Toast({
  msg,
  type,
  title: titleOverride,
  onClose,
}: {
  msg: string;
  type: ToastType;
  // Overrides the per-type default headline.
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, TOAST_DURATION);
    return () => clearTimeout(t);
    // onClose is a fresh closure every render; the timer must only start
    // once per toast (callers remount via `key`).
  }, []);

  const { accent, bg, title: defaultTitle, Icon } = STYLES[type];
  const title = titleOverride ?? defaultTitle;

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className="fixed top-[72px] right-4 z-[60] w-[min(420px,calc(100vw-32px))] rounded-[12px] shadow-2xl border overflow-hidden animate-in slide-in-from-right-8 fade-in duration-200"
      style={{
        backgroundColor: bg,
        borderColor: accent,
        borderLeftWidth: 6,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div className="flex items-start gap-3 pl-4 pr-2 py-3">
        <Icon
          size={30}
          color={accent}
          strokeWidth={2.25}
          className="shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0 pt-0.5">
          <p
            className="font-bold text-[18px] leading-[24px]"
            style={{ color: accent }}
          >
            {title}
          </p>
          <p className="text-[16px] leading-[22px] font-medium text-[#0f172a] break-words">
            {msg}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss notification"
          className="shrink-0 size-[40px] rounded-full flex items-center justify-center active:bg-black/10"
        >
          <X size={22} color="#475569" />
        </button>
      </div>
      {/* Countdown bar — shows how long until it closes on its own */}
      <div
        className="h-[4px] origin-left"
        style={{
          backgroundColor: accent,
          animation: `toast-countdown ${TOAST_DURATION}ms linear forwards`,
        }}
      />
      <style>{`
        @keyframes toast-countdown {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
