import { useEffect, useState } from "react";
import {
  SonvisageMark,
  SonvisageWordmark,
} from "./icons/SonvisageLogo";

// ─── SPLASH SCREEN ───────────────────────────────────────────────────────────
// "Powered by Sonvisage" boot screen: logo fades in, a thin brand-blue bar
// fills across the bottom, then the whole thing fades out into the app.

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "loading" | "fade">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("loading"), 100);
    const t2 = setTimeout(() => setPhase("fade"), 2200);
    const t3 = setTimeout(onDone, 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white"
      style={{
        opacity: phase === "fade" ? 0 : 1,
        transition: phase === "fade" ? "opacity 0.5s ease" : "none",
      }}
    >
      <div
        className="flex flex-col items-center"
        style={{
          gap: 56,
          opacity: phase === "in" ? 0 : 1,
          transform:
            phase === "in" ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}
      >
        <p className="text-[28px] font-medium text-[#64748b]">
          Powered by
        </p>
        <div className="flex flex-col items-center" style={{ gap: 28 }}>
          <SonvisageMark size={146} />
          <SonvisageWordmark width={560} />
        </div>
      </div>

      {/* Loading bar */}
      <div className="absolute bottom-10 left-20 right-20">
        <div className="h-[3px] bg-[rgba(52,105,178,0.12)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#3469b2]"
            style={{
              width:
                phase === "in" ? "0%" : phase === "loading" ? "85%" : "100%",
              transition: "width 1.6s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>
        <p className="text-center text-[30px] text-[#94a3b8] font-medium mt-4 tracking-widest uppercase">
          Loading...
        </p>
      </div>
    </div>
  );
}
