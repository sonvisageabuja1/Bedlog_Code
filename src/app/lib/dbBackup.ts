// Fire-and-forget mirror of local state into the Postgres backup service
// running on the same Pi (see db-backend/). This is a durable BACKUP, not
// the app's data source — localStorage (lib/storage.ts) stays the thing the
// UI actually reads and writes, so the kiosk keeps working normally even if
// this call fails or the backup service/Postgres is down or unreachable.
import type { AppConfig, Bed, Patient } from "../types";

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
    // two separate updates).
    body: JSON.stringify({ config, beds, patients, snapshotAt: Date.now() }),
  }).catch(() => {
    // Silent — best-effort local backup, never surfaced to kiosk staff.
  });
}
