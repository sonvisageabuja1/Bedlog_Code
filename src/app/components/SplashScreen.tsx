import { useEffect, useState } from "react";
import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";
import { MediboardsLogo } from "./icons/MediboardsLogo";

// ─── SPLASH SCREEN ───────────────────────────────────────────────────────────

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"logo" | "pulse" | "fade">(
    "logo",
  );

  useEffect(() => {
    // Phase 1: logo fades in (600ms), then pulse ring (800ms), then fade out (400ms)
    const t1 = setTimeout(() => setPhase("pulse"), 900);
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
        transition:
          phase === "fade" ? "opacity 0.5s ease" : "none",
      }}
    >
      {/* Ripple rings */}
      {phase === "pulse" && (
        <>
          <div
            className="absolute rounded-full border-2 border-[#3469b2]/20 animate-ping"
            style={{
              width: 160,
              height: 160,
              animationDuration: "1.2s",
            }}
          />
          <div
            className="absolute rounded-full border border-[#3469b2]/10 animate-ping"
            style={{
              width: 220,
              height: 220,
              animationDuration: "1.2s",
              animationDelay: "0.2s",
            }}
          />
        </>
      )}

      {/* Logo container with glow */}
      <div
        className="relative flex flex-col items-center gap-6"
        style={{
          opacity: phase === "logo" ? 0 : 1,
          transform:
            phase === "logo"
              ? "scale(0.88) translateY(8px)"
              : "scale(1) translateY(0)",
          transition:
            "opacity 0.6s ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Blue circle backdrop */}
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 100,
            height: 100,
            backgroundColor: "rgba(52,105,178,0.08)",
          }}
        >
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 76,
              height: 76,
              backgroundColor: "rgba(52,105,178,0.12)",
            }}
          >
            {/* MediBoards mini logo mark — just the flame */}
            <div
              className="relative"
              style={{ width: 24, height: 42 }}
            >
              <svg
                className="absolute block inset-0 size-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 9.035 15.9171"
              >
                <path d={svgPaths.p164f3b80} fill="#FF7F0B" />
                <path
                  d={svgPaths.p26d7e000}
                  stroke="#FF7F0B"
                  strokeWidth="0.0399472"
                />
                <path
                  d={svgPaths.p15880c00}
                  fill="#FF7F0B"
                  stroke="#FF7F0B"
                  strokeWidth="0.399472"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Full logo */}
        <MediboardsLogo />

        {/* Tagline */}
        <p className="text-[13px] font-medium text-[#64748b] tracking-wide">
          Hospital Bed Management
        </p>
      </div>

      {/* Loading bar */}
      <div className="absolute bottom-12 left-10 right-10">
        <div className="h-1 bg-[rgba(52,105,178,0.1)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#3469b2]"
            style={{
              width:
                phase === "logo"
                  ? "0%"
                  : phase === "pulse"
                    ? "80%"
                    : "100%",
              transition:
                "width 1.4s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>
        <p className="text-center text-[10px] text-[#94a3b8] font-medium mt-2 tracking-widest uppercase">
          {phase === "logo"
            ? ""
            : phase === "pulse"
              ? "Loading…"
              : "Ready"}
        </p>
      </div>
    </div>
  );
}
