import { ls } from "./storage";

// ─── PIN HASHING + LOCAL CACHE ─────────────────────────────────────────────────
// The Settings PIN is verified live against Mediboard when online (see
// PinModal.tsx), but a device also needs to work fully offline — so the
// last-known-good PIN is cached locally as a SHA-256 hash, never in plain
// text. Hashing a 4-digit PIN is a modest improvement over plain text (a
// casual glance at storage won't reveal it), not real cryptographic
// protection — a 4-digit PIN only has 10,000 possible values, so it can't
// meaningfully resist a deliberate attempt to crack it either way. The real
// security boundary here is physical access to the device, not the hash.

const DEFAULT_PIN = "1234";

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Falls back to the hash of "1234" when nothing has ever been cached yet —
// matches the same default a fresh device starts with today.
export async function getCachedPinHash(): Promise<string> {
  const existing = ls.get<string | null>("bl_cached_pin_hash", null);
  if (existing) return existing;
  return hashPin(DEFAULT_PIN);
}

export function setCachedPinHash(hash: string): void {
  ls.set("bl_cached_pin_hash", hash);
}

// Whether an admin has ever explicitly changed the PIN via Settings — false
// even after the default silently self-registers with Mediboard on first
// use, since that's not the same as someone deliberately picking a new one.
export function hasChangedPin(): boolean {
  return ls.get<boolean>("bl_pin_changed", false);
}

export function setHasChangedPin(v: boolean): void {
  ls.set("bl_pin_changed", v);
}
