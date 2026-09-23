import type { Bed } from "../types";

// A bed is shown by its real bed number — the same label the dashboard uses
// (e.g. "MSW-03"), assigned by Mediboard and received at onboarding and on
// every sync. The positional "Bed-01" form is only a fallback for a bed
// that somehow has no number. A patient awaiting a bed has no bed id at
// all and reads "No bed".
export function bedDisplayNumber(
  beds: Bed[],
  bedId: string | null | undefined,
): string {
  if (!bedId) return "No bed";
  const bed = beds.find((b) => b.id === bedId);
  if (bed?.number) return bed.number;
  const wardBeds = beds.filter((b) => b.wardId === bed?.wardId);
  const idx = wardBeds.findIndex((b) => b.id === bedId);
  return `Bed-${String(idx + 1).padStart(2, "0")}`;
}
