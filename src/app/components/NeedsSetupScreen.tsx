import svgPaths from "@/imports/01Dashboard-1/svg-72r1ptlwnb";
import { MediboardsLogo } from "./icons/MediboardsLogo";

// ─── NEEDS SETUP SCREEN ─────────────────────────────────────────────────────
// Shown whenever this device doesn't count as onboarded (see `isConfigValid`
// in lib/sync.ts) — whether that's a genuinely first-ever launch, or an
// onboarding attempt that got interrupted/failed partway. Deliberately the
// ONLY thing this device can ever show in that state: there is no fallback
// dashboard with placeholder data to slip into by mistake (see
// mediboard_open_questions memory — a hardcoded demo config used to make
// that possible, confirmed live to cause exactly this failure mode).

export function NeedsSetupScreen({
  onStart,
}: {
  onStart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white px-8">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
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
            <div className="relative" style={{ width: 24, height: 42 }}>
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

        <MediboardsLogo />

        <div className="flex flex-col gap-2">
          <p className="font-bold text-[18px] text-[#0f172a]">
            This device isn't set up yet
          </p>
          <p className="text-[13px] text-[#64748b] leading-relaxed">
            Connect it to Mediboard to pick the ward this device
            manages. This can also show up if a previous setup
            attempt was interrupted — nothing is lost, just start
            again below.
          </p>
        </div>

        <button
          onPointerDown={onStart}
          className="w-full h-12 rounded-[12px] text-white text-[15px] font-bold active:scale-[0.98] transition-all"
          style={{ backgroundColor: "#3469b2" }}
        >
          Set Up This Device
        </button>
      </div>
    </div>
  );
}
