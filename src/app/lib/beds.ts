import type { Bed } from "../types";

// Display-only bed numbering — shown as "Bed-01", "Bed-02", etc. regardless
// of what the underlying `bed.number` actually contains (a locally-generated
// code, or a Mediboard-issued one like "ONC-ONC-01-01"). The real `number`
// stays untouched and is still what gets sent to Mediboard on sync; this is
// purely what staff see on screen, ordered by each ward's existing bed order.
export function bedDisplayNumber(beds: Bed[], bedId: string): string {
  const wardId = beds.find((b) => b.id === bedId)?.wardId;
  const wardBeds = beds.filter((b) => b.wardId === wardId);
  const idx = wardBeds.findIndex((b) => b.id === bedId);
  return `Bed-${String(idx + 1).padStart(2, "0")}`;
}
