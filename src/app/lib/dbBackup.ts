// Fire-and-forget mirror of local state into the Postgres backup service
// running on the same Pi (see db-backend/). This is a durable BACKUP, not
// the app's data source — localStorage (lib/storage.ts) stays the thing the
// UI actually reads and writes, so the kiosk keeps working normally even if
// this call fails or the backup service/Postgres is down or unreachable.
// The one time it is read is at boot, when localStorage has no setup at all
// (see fetchLatestBackup).
import type { AppConfig, Bed, Patient } from "../types";
import { getOrCreateInstallId, isConfigValid } from "./sync";

const BACKUP_URL = "http://localhost:4002/api/backup";

export function backupState(
  config: AppConfig,
  beds: Bed[],
  patients: Patient[],
): void {
  // Nothing worth backing up before onboarding actually completes.
  if (!config.hospitalId) return;
  fetch(BACKUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // snapshotAt lets the service ignore a snapshot that arrives after a
    // newer one (posts overlap: one admission changes beds and patients in
    // two separate updates). installId travels with it because Mediboard
    // binds the ward to it, and a restore without it would look like a
    // different device trying to take the ward over. Created here if this
    // install has none yet, so the backup taken right after a restore from
    // an older (install-id-less) snapshot already holds the id the next
    // sync will bind, rather than waiting for the next bed/patient change.
    body: JSON.stringify({
      config,
      beds,
      patients,
      snapshotAt: Date.now(),
      installId: getOrCreateInstallId(),
    }),
  }).catch(() => {
    // Silent — best-effort local backup, never surfaced to kiosk staff.
  });
}

export interface BackupSnapshot {
  config: AppConfig;
  beds: Bed[];
  patients: Patient[];
  installId?: string;
}

function isUsableSnapshot(s: unknown): s is BackupSnapshot {
  const snap = s as Partial<BackupSnapshot> | null;
  return (
    !!snap &&
    !!snap.config &&
    typeof snap.config.deviceId === "string" &&
    Array.isArray(snap.config.wards) &&
    isConfigValid(snap.config) &&
    Array.isArray(snap.beds) &&
    Array.isArray(snap.patients)
  );
}

// The newest onboarded backup made on this Pi, for a device that booted
// with no usable setup in localStorage (a wiped or corrupted Chromium
// profile, typically after a power cut). The kiosk can start before the
// backup service or Postgres is up, so a refused or failed request is
// retried until `budgetMs` runs out; a 404 is a definite "nothing to
// restore". Resolves null on any failure: the device then shows setup,
// exactly as it would without a backup service.
export async function fetchLatestBackup(
  budgetMs = 10_000,
): Promise<BackupSnapshot | null> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BACKUP_URL}/latest`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.status === 404) return null;
      if (res.ok) {
        const snap: unknown = await res.json();
        return isUsableSnapshot(snap) ? snap : null;
      }
    } catch {
      // service not up yet, or timed out; retry below
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// Detach: drops this Pi's backups so the released ward isn't restored onto
// it at the next boot. Best effort, like backupState: by the time this runs
// Mediboard has already released the ward, so a failure here can't undo it.
export async function clearBackup(): Promise<void> {
  try {
    await fetch(BACKUP_URL, {
      method: "DELETE",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // backup service down; nothing more to do
  }
}
