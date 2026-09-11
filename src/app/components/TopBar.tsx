import { MediboardsLogo } from "./icons/MediboardsLogo";
import { GearIcon } from "./icons/GearIcon";
import { LiveClock } from "./LiveClock";

// ─── TOP BAR ─────────────────────────────────────────────────────────────────

export function TopBar({
  onSettingsPress,
}: {
  onSettingsPress: () => void;
}) {
  return (
    <div className="flex-shrink-0 bg-white flex gap-3 items-center px-5 py-[9px] border-b border-black/10">
      {/* Logo + date/time — flex-1 matches design's Heading with flex-[813.276_0_0] */}
      <div className="flex-1 flex items-center justify-between overflow-hidden">
        <MediboardsLogo />
        <LiveClock />
      </div>
      {/* Gear / settings */}
      <GearIcon onPress={onSettingsPress} />
    </div>
  );
}
