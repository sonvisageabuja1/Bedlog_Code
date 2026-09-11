import type { AppConfig, Bed, BedStatus, Patient, Ward } from "../types";
import { uid } from "./id";
import { ls } from "./storage";

// ─── DEVICE IDENTITY ──────────────────────────────────────────────────────────
// BedLog is deployed one-device-per-ward: each install needs a stable id so
// sync payloads can be attributed to the physical device that sent them.
// Generated once on first run and persisted independently of bl_config so it
// survives a config reset/re-onboard.
export function getOrCreateDeviceId(): string {
  const existing = ls.get<string | null>("bl_device_id", null);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as { randomUUID: () => string }).randomUUID()
      : uid();
  ls.set("bl_device_id", id);
  return id;
}

// Overrides the device's id — used when onboarding creates a new ward
// through Mediboard's `/setup` endpoint, which issues its own real
// deviceId. That real id has to replace whatever local placeholder existed
// before, since `/sync` only works for a deviceId Mediboard actually knows
// about.
export function setDeviceId(id: string): void {
  ls.set("bl_device_id", id);
}

// Loads the persisted config (if any) and guarantees deviceId is populated,
// backfilling it for installs that existed before deviceId was introduced.
//
// Falls back to a genuinely EMPTY config, never placeholder/demo data — a
// hardcoded "City General Hospital" with fake wards used to live here
// (`DEFAULT_CONFIG`/`DEFAULT_WARDS` in constants.ts), and a timing bug
// elsewhere could let that fake data get silently treated as a real,
// completed onboarding (confirmed live, 2026-09-04, on a real kiosk device:
// an interrupted onboarding attempt left the dummy config persisted, and a
// later reload skipped straight to a dashboard showing "General Ward"/"ICU"
// as if they were real). Removing the fake data entirely closes this off
// structurally — see `isConfigValid` below, which is what actually decides
// whether a device counts as configured, checked against real content
// (a real `hospitalId` + at least one real ward) rather than "was
// *something* ever saved."
export function loadStoredConfig(): AppConfig {
  const stored = ls.get<AppConfig | null>("bl_config", null);
  const deviceId = stored?.deviceId ?? getOrCreateDeviceId();
  return stored
    ? { ...stored, deviceId }
    : { hospitalName: "", wards: [], deviceId };
}

// The single source of truth for "has this device actually been onboarded."
// Checked against real config content, not just "has anything ever been
// saved" — so a corrupted or incomplete config (missing `hospitalId`, or no
// wards) is treated exactly the same as a device that's never been set up
// at all, rather than silently passing through as if it were valid.
export function isConfigValid(config: AppConfig): boolean {
  return !!config.hospitalId && config.wards.length > 0;
}

// ─── DATA SYNC ────────────────────────────────────────────────────────────────
// Builds a full snapshot of the ward/bed/patient data and POSTs it as JSON to
// a user-configured endpoint (see Settings > Data Sync). Used both for the
// manual "Send Now" button and the automatic once-daily trigger.

export function buildSyncPayload(
  config: AppConfig,
  beds: Bed[],
  patients: Patient[],
) {
  return {
    deviceId: config.deviceId,
    deviceLabel: config.deviceLabel ?? null,
    wardIds: config.wards.map((w) => w.id),
    generatedAt: new Date().toISOString(),
    hospitalName: config.hospitalName,
    wards: config.wards,
    beds,
    patients,
    summary: {
      totalBeds: beds.length,
      occupiedBeds: beds.filter((b) => b.status === "occupied")
        .length,
      availableBeds: beds.filter(
        (b) => b.status === "available",
      ).length,
      admittedPatients: patients.filter(
        (p) => p.status === "admitted",
      ).length,
    },
  };
}

export async function sendSyncPayload(
  url: string,
  payload: ReturnType<typeof buildSyncPayload>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Server responded ${res.status}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Network error",
    };
  }
}

export function makeBeds(wards: Ward[]): Bed[] {
  return wards.flatMap((w) =>
    Array.from({ length: w.bedCount }, (_, i) => ({
      id: `${w.id}_${i + 1}`,
      number: `${(w.code || w.name.slice(0, 2)).toUpperCase()}-${i + 1}`,
      wardId: w.id,
      status: "available" as BedStatus,
      updatedAt: Date.now(),
    })),
  );
}
// A bed's id is either locally generated (this exact `${wardId}_${n}`
// pattern, from makeBeds) or a real Mediboard-issued id (a UUID, from
// onboarding a linked ward). Only the former is safe to re-derive a
// `number` for from the ward's code — a Mediboard-sourced bed's number is
// their data, not ours to recompute.
function isLocalBedId(id: string, wardId: string): boolean {
  return id.startsWith(`${wardId}_`);
}

// Runs on every app load to reconcile persisted beds against the current
// ward config. This used to assume every bed id follows the local pattern
// above and silently replaced anything that didn't match — which wiped
// real Mediboard bed ids (and their status/patient links) on every single
// reload. Fixed, 2026-08-24: a ward's beds are left completely untouched
// as long as the count still matches what's configured; only a genuine
// bed-count change (edited in Settings) regenerates that ward's beds.
export function syncBeds(existing: Bed[], wards: Ward[]): Bed[] {
  return wards.flatMap((w) => {
    const wardBeds = existing.filter((b) => b.wardId === w.id);
    if (wardBeds.length !== w.bedCount) {
      return makeBeds([w]);
    }
    return wardBeds.map((b, i) =>
      isLocalBedId(b.id, w.id)
        ? {
            ...b,
            number: `${(w.code || w.name.slice(0, 2)).toUpperCase()}-${i + 1}`,
          }
        : b,
    );
  });
}
