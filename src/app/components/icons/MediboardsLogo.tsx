import { LogoFlame } from "./LogoFlame";
import { LogoMediText } from "./LogoMediText";
import { LogoTopText } from "./LogoTopText";
import { LogoOrangeName } from "./LogoOrangeName";
import { LogoBlueName } from "./LogoBlueName";

// `variant="light"` is for use on the brand-blue background itself (the
// onboarding header) — the wordmark parts are hardcoded blue, so on that
// background they're invisible unless switched to white. The flame/orange
// name always stays orange either way; only the blue wordmark switches.
export function MediboardsLogo({
  variant = "color",
}: {
  variant?: "color" | "light";
}) {
  const wordmarkColor = variant === "light" ? "#FFFFFF" : "#3469B2";
  return (
    <div
      className="relative shrink-0"
      style={{ height: "41.726px", width: "103.61px" }}
    >
      <div className="relative size-full overflow-hidden">
        <LogoFlame />
        <LogoMediText color={wordmarkColor} />
        <LogoTopText color={wordmarkColor} />
        <LogoOrangeName />
        <LogoBlueName color={wordmarkColor} />
      </div>
    </div>
  );
}
