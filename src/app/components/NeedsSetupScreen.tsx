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
      <div className="flex flex-col items-center gap-12 max-w-3xl text-center">
        <MediboardsLogo scale={2} />

        <div className="flex flex-col gap-4">
          <p className="font-bold text-[36px] text-[#0f172a]">
            This device isn't set up yet
          </p>
          <p className="text-[26px] text-[#64748b] leading-relaxed">
            Connect it to Mediboard to pick the ward this device
            manages. This can also show up if a previous setup
            attempt was interrupted — nothing is lost, just start
            again below.
          </p>
        </div>

        <button
          onPointerDown={onStart}
          className="w-full h-24 rounded-[24px] text-white text-[30px] font-bold active:scale-[0.98] transition-all"
          style={{ backgroundColor: "#3469b2" }}
        >
          Set Up This Device
        </button>
      </div>
    </div>
  );
}
