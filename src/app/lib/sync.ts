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

// Identity of this physical install, distinct from `deviceId` above (which
// onboarding overwrites with Mediboard's own bed-log id). Mediboard binds a
// ward to exactly one of these; it is sent on /setup and every /sync, and
// is deliberately NOT cleared on detach so the same Pi is recognised again.
export function getOrCreateInstallId(): string {
  const existing = ls.get<string | null>("bl_install_id", null);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as { randomUUID: () => string }).randomUUID()
      : uid();
  ls.set("bl_install_id", id);
  return id;
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
// manual "Sync Now" button and the automatic once-daily trigger.

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

// A bed's id is either locally generated (this exact `${wardId}_${n}`
// pattern, from the removed makeBeds helper) or a real Mediboard-issued id (a UUID, from
// onboarding a linked ward). Only the former is safe to re-derive a
// `number` for from the ward's code — a Mediboard-sourced bed's number is
// their data, not ours to recompute.
function isLocalBedId(id: string, wardId: string): boolean {
  return id.startsWith(`${wardId}_`);
}

// Runs on every app load to reconcile persisted beds against the current
// ward config. Beds are never generated from a ward's capacity — a ward's
// beds are exactly the rows Mediboard has for it (seeded at onboarding),
// so a ward with no beds on the dashboard shows no beds here. This only drops beds of wards that are no longer configured and
// renumbers legacy locally-generated beds from the ward code.
export function syncBeds(existing: Bed[], wards: Ward[]): Bed[] {
  return wards.flatMap((w) => {
    const wardBeds = existing.filter((b) => b.wardId === w.id);
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

// Timestamp of the newest local bed/patient change — what the catch-up sync
// and the top-bar "unsynced changes" badge compare against the last
// successful sync.
export function latestLocalChange(beds: Bed[], patients: Patient[]): number {
  return Math.max(
    0,
    ...beds.map((b) => b.updatedAt),
    ...patients.flatMap((p) => [p.admittedAt, p.dischargedAt ?? 0]),
  );
}

export interface MediboardBedSnapshot {
  id: string;
  number: string;
  status: string;
}

// Merges the authoritative bed LIST from Mediboard (returned on every sync)
// into the device's beds, so beds added or removed on the dashboard show up
// without re-onboarding. Occupancy stays local:
//  - beds Mediboard has that we don't are added (server status, no patient);
//  - beds we have that Mediboard no longer lists are dropped, unless they
//    are occupied here — a locally admitted patient must never vanish;
//  - beds on both sides keep their local status/patient and take the
//    server's bed number.
// Returns the SAME array when nothing changed, so callers (and the
// real-time sync effect keyed on `beds`) don't churn.
export function reconcileBedsFromMediboard(
  local: Bed[],
  wardId: string,
  server: MediboardBedSnapshot[],
  knownStatuses: readonly BedStatus[],
): Bed[] {
  const localById = new Map(local.map((b) => [b.id, b]));
  const serverIds = new Set(server.map((b) => b.id));
  const now = Date.now();
  const next: Bed[] = [];

  for (const sb of server) {
    const mine = localById.get(sb.id);
    if (mine) {
      next.push(mine.number === sb.number ? mine : { ...mine, number: sb.number });
    } else {
      next.push({
        id: sb.id,
        number: sb.number,
        wardId,
        status: knownStatuses.includes(sb.status as BedStatus)
          ? (sb.status as BedStatus)
          : "available",
        updatedAt: now,
      });
    }
  }
  for (const b of local) {
    if (!serverIds.has(b.id) && b.status === "occupied") {
      console.warn(
        `Bed ${b.number} was removed on Mediboard but is occupied here — keeping it`,
      );
      next.push(b);
    }
  }

  const same =
    next.length === local.length &&
    next.every((b, i) => b === local[i]);
  return same ? local : next;
}
