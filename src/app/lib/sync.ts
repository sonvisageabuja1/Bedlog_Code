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
  patient_hospital_number?: string | null;
}

export interface MediboardPatientSnapshot {
  // Mediboard's admissions row id.
  id: string;
  hospitalNumber: string;
  name?: string | null;
  admittedAt: number;
  // null: admitted from app-client without a bed (awaiting a bed here).
  bedId: string | null;
  // The admissions row's own status word. Rows opened from the dashboard
  // used to be written with no status at all, so null means "admitted".
  status: string | null;
}

const rowStatus = (p: { status: string | null }) => p.status ?? "admitted";

// Merges the authoritative state Mediboard returns on every sync into the
// device's beds and patients, so what happens on the dashboard (beds added
// or removed, a patient admitted from app-client) shows up here without
// re-onboarding.
//
//  Bed LIST — the dashboard is the source of truth:
//   - beds Mediboard has that we don't are added;
//   - beds we have that Mediboard no longer lists are dropped, unless they
//     are occupied here — a locally admitted patient must never vanish;
//   - bed numbers are taken from the server.
//
//  OCCUPANCY — local wins where the device has its own patient, otherwise
//  the server's open admission is adopted:
//   - server occupied + local has no patient in that bed → mark occupied and
//     create the local patient record from the server's current admission
//     (this is the "admitted from app-client" case);
//   - local occupied + server available → keep local; the device's own
//     admission is pushed on this same sync and the server will show it
//     occupied in the next reply;
//   - both occupied with different patients → keep local, warn. Discharging
//     locally then syncing resolves it;
//   - local occupied, but the server shows THIS stay closed (a discharge /
//     LAMA / deceased / absconded event for the same patient, bed and
//     admission time — i.e. done from app-client) → discharge locally with
//     that outcome and free the bed;
//   - local occupied, but the server has the SAME patient occupying a
//     different bed → this local record is a stale duplicate (the server
//     moved the patient, or a double admit slipped through). It is removed
//     outright, not discharged: pushing it again as an admission would make
//     the server move the patient back and the two sides would flip-flop.
//
//  AWAITING-BED admissions — opened from app-client with a ward but no bed
//  (`bedId: null` in the reply). They belong to no bed, so the bed pass
//  never sees them; a separate pass keeps them in step:
//   - a server one the device does not have is adopted as a local patient
//     with no bed, keyed by Mediboard's admission id — unless a local
//     ADMITTED patient with that hospital number already exists (the nurse
//     admitted them straight into a bed before this reply arrived; local
//     wins and the push completes the server's row);
//   - a local one whose server row now carries a bed (assigned from
//     app-client in the meantime) takes that bed here, if it is free;
//   - a local one the server no longer lists as open (closed from
//     app-client, or gone) is dropped — nothing happened on this device, so
//     there is no local outcome to keep;
//   - a local one still open with no bed on the server is left alone. If
//     the nurse has meanwhile assigned a bed here, the record already has a
//     bed and is pushed on this very sync.
//
// Returns the SAME arrays when nothing changed, so callers (and the
// real-time sync effect keyed on `beds`/`patients`) don't churn.
const CLOSED_OUTCOMES: readonly string[] = [
  "discharged",
  "deceased",
  "lama",
  "absconded",
];

export function reconcileWithMediboard(
  localBeds: Bed[],
  localPatients: Patient[],
  wardId: string,
  server: { beds: MediboardBedSnapshot[]; patients: MediboardPatientSnapshot[] },
  knownStatuses: readonly BedStatus[],
): { beds: Bed[]; patients: Patient[] } {
  const localById = new Map(localBeds.map((b) => [b.id, b]));
  const serverIds = new Set(server.beds.map((b) => b.id));
  const now = Date.now();
  const nextBeds: Bed[] = [];
  let nextPatients: Patient[] = [...localPatients];
  let patientsChanged = false;

  // A closing event on the server for the same stay as a local admission.
  const serverClosureFor = (p: Patient) =>
    server.patients.find(
      (e) =>
        e.hospitalNumber === p.hospitalNumber &&
        e.bedId === p.bedId &&
        CLOSED_OUTCOMES.includes(rowStatus(e)) &&
        Math.abs(e.admittedAt - p.admittedAt) < 60_000,
    );

  const localPatientFor = (bed: Bed | undefined) =>
    bed?.patientId
      ? localPatients.find((p) => p.id === bed.patientId && p.status === "admitted")
      : undefined;

  const serverAdmissionFor = (sb: MediboardBedSnapshot) =>
    server.patients
      .filter(
        (p) =>
          rowStatus(p) === "admitted" &&
          p.bedId === sb.id &&
          (!sb.patient_hospital_number ||
            p.hospitalNumber === sb.patient_hospital_number),
      )
      .sort((a, b) => b.admittedAt - a.admittedAt)[0];

  for (const sb of server.beds) {
    const mine = localById.get(sb.id);
    const serverOccupied = sb.status === "occupied";
    const localPatient = localPatientFor(mine);

    if (mine) {
      let bed = mine.number === sb.number ? mine : { ...mine, number: sb.number };
      if (serverOccupied && !localPatient) {
        const adm = serverAdmissionFor(sb);
        const hospitalNumber = adm?.hospitalNumber ?? sb.patient_hospital_number;
        if (hospitalNumber) {
          const patient: Patient = {
            id: uid(),
            hospitalNumber,
            name: adm?.name ?? undefined,
            admittedAt: adm?.admittedAt ?? now,
            bedId: sb.id,
            wardId,
            status: "admitted",
            serverAdmissionId: adm?.id,
          };
          nextPatients.push(patient);
          patientsChanged = true;
          bed = { ...bed, status: "occupied", patientId: patient.id, updatedAt: now };
        }
      } else if (
        localPatient &&
        !(serverOccupied && sb.patient_hospital_number === localPatient.hospitalNumber)
      ) {
        const closure = serverClosureFor(localPatient);
        const serverBedOfPatient = server.beds.find(
          (b) =>
            b.status === "occupied" &&
            b.patient_hospital_number === localPatient.hospitalNumber &&
            b.id !== sb.id,
        );
        if (serverBedOfPatient) {
          console.warn(
            `Bed ${sb.number}: Mediboard has ${localPatient.hospitalNumber} in ${serverBedOfPatient.number} — dropping the stale local admission here`,
          );
          nextPatients = nextPatients.filter((p) => p.id !== localPatient.id);
          patientsChanged = true;
          bed = { ...bed, status: "available", patientId: undefined, updatedAt: now };
        } else if (closure) {
          // Discharged from the dashboard: mirror it here.
          const outcome = rowStatus(closure) as Patient["dischargeType"];
          nextPatients = nextPatients.map((p) =>
            p.id === localPatient.id
              ? { ...p, status: "discharged", dischargeType: outcome, dischargedAt: now }
              : p,
          );
          patientsChanged = true;
          bed = { ...bed, status: "available", patientId: undefined, updatedAt: now };
        } else if (serverOccupied && sb.patient_hospital_number) {
          console.warn(
            `Bed ${sb.number}: Mediboard has ${sb.patient_hospital_number} but this device has ${localPatient.hospitalNumber} — keeping the local admission`,
          );
        }
      }
      nextBeds.push(bed);
    } else {
      const status = knownStatuses.includes(sb.status as BedStatus)
        ? (sb.status as BedStatus)
        : "available";
      let bed: Bed = { id: sb.id, number: sb.number, wardId, status, updatedAt: now };
      if (serverOccupied) {
        const adm = serverAdmissionFor(sb);
        const hospitalNumber = adm?.hospitalNumber ?? sb.patient_hospital_number;
        if (hospitalNumber) {
          const patient: Patient = {
            id: uid(),
            hospitalNumber,
            name: adm?.name ?? undefined,
            admittedAt: adm?.admittedAt ?? now,
            bedId: sb.id,
            wardId,
            status: "admitted",
            serverAdmissionId: adm?.id,
          };
          nextPatients.push(patient);
          patientsChanged = true;
          bed = { ...bed, patientId: patient.id };
        }
      }
      nextBeds.push(bed);
    }
  }
  for (const b of localBeds) {
    if (!serverIds.has(b.id) && b.status === "occupied") {
      console.warn(
        `Bed ${b.number} was removed on Mediboard but is occupied here — keeping it`,
      );
      nextBeds.push(b);
    }
  }

  // ── Awaiting-bed admissions ──────────────────────────────────────────────
  // The reply lists every admissions row and never says which are closed:
  // the opening row of a no-bed stay keeps `status: "admitted"` after it is
  // closed, and the outcome arrives as its own row (same hospital number and
  // admittedAt, bedId null, a closing status). So "still open" means "no
  // such closing row exists".
  const hn = (s: string) => s.trim().toLowerCase();
  const serverById = new Map(server.patients.map((p) => [p.id, p]));
  // The outcome row carries whichever bed the stay had when it closed —
  // none if it was still awaiting one, or the bed app-client assigned
  // before discharging — so the bed is deliberately not part of the match.
  const closedOnServer = (row: MediboardPatientSnapshot) =>
    server.patients.some(
      (e) =>
        e.id !== row.id &&
        hn(e.hospitalNumber) === hn(row.hospitalNumber) &&
        CLOSED_OUTCOMES.includes(rowStatus(e)) &&
        Math.abs(e.admittedAt - row.admittedAt) < 60_000,
    );
  const bedById = new Map(nextBeds.map((b) => [b.id, b]));

  // Local awaiting-bed records first, so a record that is completed or
  // dropped here is not re-adopted below.
  for (const lp of localPatients) {
    if (lp.status !== "admitted" || lp.bedId) continue;
    const row = lp.serverAdmissionId
      ? serverById.get(lp.serverAdmissionId)
      : undefined;

    if (!row || closedOnServer(row)) {
      // Closed from app-client (with or without a bed having been assigned
      // there first), or the admission no longer exists. Nothing was
      // recorded on this device, so there is no outcome to show. Checked
      // FIRST: a closed stay's opening row still carries the bed it ended
      // in, and must never be mistaken for a fresh bed assignment.
      nextPatients = nextPatients.filter((p) => p.id !== lp.id);
      patientsChanged = true;
    } else if (row.bedId) {
      // Completed from app-client while the nurse had not yet picked a bed.
      const bed = bedById.get(row.bedId);
      const occupant = bed?.patientId
        ? nextPatients.find((p) => p.id === bed.patientId)
        : undefined;
      if (occupant && hn(occupant.hospitalNumber) === hn(lp.hospitalNumber)) {
        // The bed pass above already saw the bed occupied by this patient
        // and adopted the completed admission; this record is now a
        // duplicate of it.
        nextPatients = nextPatients.filter((p) => p.id !== lp.id);
        patientsChanged = true;
      } else if (bed && bed.status === "available") {
        const occupied: Bed = {
          ...bed,
          status: "occupied",
          patientId: lp.id,
          updatedAt: now,
        };
        bedById.set(bed.id, occupied);
        nextBeds[nextBeds.indexOf(bed)] = occupied;
        nextPatients = nextPatients.map((p) =>
          p.id === lp.id ? { ...p, bedId: bed.id } : p,
        );
        patientsChanged = true;
      } else {
        console.warn(
          `HN ${lp.hospitalNumber}: Mediboard assigned bed ${bed?.number ?? row.bedId} but it is not free here — still awaiting a bed on this device`,
        );
      }
    }
  }

  const localAdmittedHns = new Set(
    nextPatients.filter((p) => p.status === "admitted").map((p) => hn(p.hospitalNumber)),
  );
  const knownAdmissionIds = new Set(
    nextPatients.map((p) => p.serverAdmissionId).filter(Boolean),
  );
  for (const row of server.patients) {
    if (rowStatus(row) !== "admitted" || row.bedId) continue;
    if (knownAdmissionIds.has(row.id)) continue;
    if (closedOnServer(row)) continue;
    if (localAdmittedHns.has(hn(row.hospitalNumber))) continue;
    nextPatients.push({
      id: uid(),
      hospitalNumber: row.hospitalNumber,
      name: row.name ?? undefined,
      admittedAt: row.admittedAt,
      bedId: null,
      wardId,
      status: "admitted",
      serverAdmissionId: row.id,
    });
    localAdmittedHns.add(hn(row.hospitalNumber));
    knownAdmissionIds.add(row.id);
    patientsChanged = true;
  }

  const bedsSame =
    nextBeds.length === localBeds.length &&
    nextBeds.every((b, i) => b === localBeds[i]);
  return {
    beds: bedsSame ? localBeds : nextBeds,
    patients: patientsChanged ? nextPatients : localPatients,
  };
}
