import type { AppConfig, Bed, BedStatus, Patient, Ward } from "../types";
import { uid } from "./id";
import { getOrCreateInstallId } from "./sync";

// ─── MEDIBOARD API CLIENT ──────────────────────────────────────────────────────
// BedLog's "mother product" — onboarding fetches hospital/ward data from here.
// Requires internet; day-to-day device use does not depend on this module.

const MEDIBOARD_BASE_URL = "https://api.mediboards.io/api";

interface MediboardListResponse<T> {
  success: boolean;
  data: T[];
}
interface MediboardErrorResponse {
  status: "error";
  message: string;
}

export interface MediboardHospital {
  id: string;
  name: string;
  // Cloudinary URL uploaded from the Mediboards admin, or null when the
  // hospital has no logo yet — the picker shows a placeholder in that case.
  logoUrl: string | null;
}

interface MediboardHospitalRow {
  id: string;
  name: string;
  logo_url: string | null;
}

export interface MediboardDepartment {
  id: number;
  name: string;
}

export interface MediboardWard {
  id: string;
  name: string;
  code: string;
  capacity: number;
  bed_count: number;
  status: string;
  ward_section: string;
  hospital_id: string;
}

async function mediboardFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MEDIBOARD_BASE_URL}${path}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `Mediboard request failed: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.ok) {
    const message =
      (body as Partial<MediboardErrorResponse>)?.message ??
      `${res.status} ${res.statusText}`;
    throw new Error(`Mediboard request failed: ${message}`);
  }
  const list = body as MediboardListResponse<unknown>;
  if (!list.success) {
    throw new Error("Mediboard request returned success: false");
  }
  return body as T;
}

// Fetches every hospital across the whole Mediboard system — one row per
// hospital, nothing else. Departments are fetched separately per hospital
// (see fetchMediboardDepartments) once one is picked.
export async function fetchMediboardHospitals(): Promise<
  MediboardHospital[]
> {
  const { data } =
    await mediboardFetch<MediboardListResponse<MediboardHospitalRow>>(
      "/hospitals",
    );
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url || null,
  }));
}

// Active departments only — a ward is registered against a department
// (see `departmentName` on the /setup payload), and hospitals with 20-30+
// departments need this to make the ward list browsable.
export async function fetchMediboardDepartments(
  hospitalId: string,
): Promise<MediboardDepartment[]> {
  const { data } = await mediboardFetch<
    MediboardListResponse<MediboardDepartment>
  >(`/hospital/${encodeURIComponent(hospitalId)}/departments`);
  return data;
}

export async function fetchMediboardWards(
  hospitalId: string,
): Promise<MediboardWard[]> {
  const { data } = await mediboardFetch<
    MediboardListResponse<MediboardWard>
  >(`/hospital/${encodeURIComponent(hospitalId)}/ward`);
  return data;
}

// GET .../ward (the plain ward list, used above) carries no department
// field at all — confirmed by testing. The per-ward "device" (bed-log
// state) endpoint does, nested on `ward.departmentId`/`departmentName` —
// confirmed live, 2026-08-21. It's per-ward, not a bulk list, so scoping
// the ward picker by department means calling this once per ward. This
// same response also carries `deviceId`/`deviceLabel` — real if some
// device has already been through `/setup` for this ward before, `null`
// otherwise. Onboarding uses that to let a device inherit an existing
// ward's real deviceId instead of falling back to a locally-generated one
// that Mediboard has never heard of (confirmed live, 2026-08-24: an
// unrecognized deviceId makes `/sync` fail with "Bed log not found").
// Bed/patient shapes as returned by THIS endpoint specifically — snake_case
// `patient_hospital_number` on beds (vs. camelCase on the plain `/bed`
// endpoint, a known casing inconsistency), plus a separate `patients` array
// carrying each admission's real `hospitalNumber`/`admittedAt`/`status`,
// keyed to a bed via `bedId`. Onboarding uses this (not the plain `/bed`
// endpoint) to seed an existing ward's state — confirmed live, 2026-08-29,
// that the plain `/bed` endpoint has its own bug where a bed with more than
// one historical admission returns duplicate rows with stale data, whereas
// this endpoint's `patients` array correctly reflects only the current
// admitted patient per bed (and gives a real `admittedAt`, which `/bed`
// never provided at all).
export interface MediboardDeviceBed {
  id: string;
  number: string;
  wardId: string;
  status: string;
  patient_hospital_number: string | null;
  updatedAt: number;
}
export interface MediboardDevicePatient {
  // Mediboard's admissions row id.
  id: string;
  hospitalNumber: string;
  // Patient name from Mediboards; absent on older API builds.
  name?: string | null;
  admittedAt: number;
  // null for an admission created from app-client without a bed (the
  // "awaiting bed" case this device completes).
  bedId: string | null;
  wardId: string;
  // Null on rows the dashboard opened without a status word; read as
  // "admitted".
  status: string | null;
}

interface MediboardWardDeviceEnvelope {
  success: boolean;
  data: {
    deviceId: string | null;
    deviceLabel: string | null;
    deviceUid: string | null;
    deviceAttachedAt: string | null;
    ward: {
      id: string;
      departmentId: number;
      departmentName: string;
    };
    beds: MediboardDeviceBed[];
    patients: MediboardDevicePatient[];
  };
}

export interface MediboardWardInfo {
  departmentId: number;
  departmentName: string;
  deviceId: string | null;
  deviceLabel: string | null;
  // Install id of the physical device attached to this ward (see
  // getOrCreateInstallId) — null when no device is attached. Compare
  // against this install's own id to tell "mine" from "someone else's".
  deviceUid: string | null;
  deviceAttachedAt: string | null;
}

// Returns null (rather than throwing) on any failure — an unknown
// department/device should mean "don't hide this ward," not "break the
// picker."
export async function fetchMediboardWardInfo(
  hospitalId: string,
  wardId: string,
): Promise<MediboardWardInfo | null> {
  try {
    const { data } =
      await mediboardFetch<MediboardWardDeviceEnvelope>(
        `/hospital/${encodeURIComponent(hospitalId)}/ward/${encodeURIComponent(wardId)}/device`,
      );
    return {
      departmentId: data.ward.departmentId,
      departmentName: data.ward.departmentName,
      deviceId: data.deviceId,
      deviceLabel: data.deviceLabel,
      deviceUid: data.deviceUid ?? null,
      deviceAttachedAt: data.deviceAttachedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function mediboardWardToLocal(w: MediboardWard): Ward {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    capacity: w.capacity,
    floor: w.ward_section,
  };
}

export const KNOWN_BED_STATUSES: readonly BedStatus[] = [
  "available",
  "occupied",
  "cleaning",
  "reserved",
  "maintenance",
];

// Converts a ward's real Mediboard bed + patient lists (from `/device`) into
// local Bed/Patient records, so onboarding an already-populated ward
// inherits its actual occupancy instead of resetting every bed to
// "available".
//
// The bed's own `patient_hospital_number` — not the `patients` array's
// `status` field — is the source of truth for WHO currently occupies it.
// This matters because the `patients` array is now a permanent, append-only
// history (since the 2026-08-31 discharge fix, see mediboard_open_questions
// memory item 3): every past admission's original entry stays frozen at
// `status: "admitted"` forever, even long after it was properly discharged
// via a separate record. A bed with any admission history at all — which,
// on a heavily-tested ward, can span months — ends up with MULTIPLE
// `"admitted"`-status entries for the same `bedId`. Naively picking "the"
// admitted entry per bed (e.g. via a plain `Map` keyed on `bedId`) can pick
// up a stale admission from long ago instead of the current one — confirmed
// live, 2026-09-01: onboarding "Test by Pro" this way showed a patient
// "admitted 466 days ago" instead of the one actually just admitted.
//
// Fixed by matching on BOTH `bedId` and the bed's own (reliable) current
// `patient_hospital_number`, then taking the most recent `admittedAt` among
// any remaining matches (in case the same person has been admitted to the
// same bed more than once over time).
//
// One remaining gap, worth flagging rather than silently guessing: Mediboard
// shows a patient on "reserved" beds too (someone pre-registered before
// physically occupying it), but our Patient model has no pre-admission
// state — only "admitted" or "discharged" — so reserved beds keep their
// status locally with no linked patient. That reservation-holder's identity
// is silently dropped for now.
export function mediboardDeviceStateToLocal(
  wardId: string,
  beds: MediboardDeviceBed[],
  patients: MediboardDevicePatient[],
): { beds: Bed[]; patients: Patient[] } {
  const localBeds: Bed[] = [];
  const localPatients: Patient[] = [];

  for (const b of beds) {
    const status = KNOWN_BED_STATUSES.includes(
      b.status as BedStatus,
    )
      ? (b.status as BedStatus)
      : "available";
    if (b.status !== status) {
      console.warn(
        `Mediboard bed ${b.id} has unrecognized status "${b.status}" — defaulting to "available"`,
      );
    }

    let patientId: string | undefined;
    if (status === "occupied" && b.patient_hospital_number) {
      const currentAdmission = patients
        .filter(
          (p) =>
            (p.status ?? "admitted") === "admitted" &&
            p.bedId === b.id &&
            p.hospitalNumber === b.patient_hospital_number,
        )
        .sort((a, c) => c.admittedAt - a.admittedAt)[0];

      if (currentAdmission) {
        patientId = uid();
        localPatients.push({
          id: patientId,
          hospitalNumber: currentAdmission.hospitalNumber,
          admittedAt: currentAdmission.admittedAt,
          bedId: b.id,
          wardId,
          status: "admitted",
        });
      }
    }

    localBeds.push({
      id: b.id,
      number: b.number,
      wardId,
      status,
      patientId,
      updatedAt: b.updatedAt,
    });
  }

  // Admissions opened from app-client with no bed. They belong to no bed
  // row, so the loop above never sees them; adopt them as awaiting-bed
  // patients keyed by Mediboard's admission id so later syncs can match.
  for (const p of patients) {
    if ((p.status ?? "admitted") !== "admitted" || p.bedId) continue;
    localPatients.push({
      id: uid(),
      hospitalNumber: p.hospitalNumber,
      name: p.name ?? undefined,
      admittedAt: p.admittedAt,
      bedId: null,
      wardId,
      status: "admitted",
      serverAdmissionId: p.id,
    });
  }

  return { beds: localBeds, patients: localPatients };
}

export async function fetchMediboardWardSeed(
  hospitalId: string,
  wardId: string,
): Promise<{ beds: Bed[]; patients: Patient[] }> {
  const { data } = await mediboardFetch<MediboardWardDeviceEnvelope>(
    `/hospital/${encodeURIComponent(hospitalId)}/ward/${encodeURIComponent(wardId)}/device`,
  );
  return mediboardDeviceStateToLocal(
    wardId,
    data.beds,
    data.patients,
  );
}

// A cold Mediboard instance (their API is on Render, which idles free/
// starter-tier services) can fail the CORS preflight on the first request
// after being idle — confirmed live, 2026-08-20: an onboarding attempt got
// a browser-level "Failed to fetch"/CORS error, then an identical retry
// seconds later succeeded cleanly once the instance was warm. `fetch`
// throwing a TypeError (as opposed to an HTTP error status, which is
// caught above) is the signature of that failure mode, so retry it once
// after a short delay before surfacing an error to the user.
async function withColdStartRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return fn();
  }
}

// Register a device for an existing ward — 2026-09-01, per the developer's
// updated design: BedLog no longer creates wards at all; every ward comes
// from Mediboard's own hospital account. `/setup` now takes a real, already-
// existing `ward.id` (plus its current name/code/capacity/floor) instead of
// details for a brand-new ward, and registers a device against exactly that
// ward — no ward-creation side effect anymore. Confirmed live, 2026-09-01,
// against "Bedlog Test Ward" (a real ward with no prior device): issued a
// real deviceId, no duplicate ward or bed created.
//
// This is still the ONLY endpoint that issues a deviceId, and `/sync` still
// only works for one that came from here (confirmed live, 2026-08-24 — a
// locally-made-up deviceId crashes `/sync` with a 500). But per the agreed
// onboarding flow, it's only ever called ONCE per ward — the first time it's
// onboarded, when `/device` shows no `deviceId` yet. A ward that already has
// one goes through `/device` (read-only) instead, every time after that, so
// this never gets called twice for the same ward and can't re-issue or
// orphan an existing device.
export interface MediboardSetupDevice {
  deviceId: string;
  deviceLabel: string;
  generatedAt: string;
  hospitalName: { id: string; name: string };
  ward: {
    id: string;
    name: string;
    code: string;
    capacity: number;
    bedCount: number;
    floor: string;
  };
  beds: MediboardDeviceBed[];
  patients: MediboardDevicePatient[];
  summary: {
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    admittedPatients: number;
  };
}

// Thrown when the ward is attached to a different device and the caller
// did not ask to replace it (HTTP 409 from /setup).
export class MediboardDeviceConflictError extends Error {
  readonly status = 409;
}

async function registerMediboardDeviceOnce(
  hospitalId: string,
  params: {
    departmentId: number;
    replaceDevice?: boolean;
    ward: {
      id: string;
      name: string;
      code: string;
      capacity: number;
      floor: string;
    };
  },
): Promise<MediboardSetupDevice> {
  const res = await fetch(
    `${MEDIBOARD_BASE_URL}/hospital/${encodeURIComponent(hospitalId)}/setup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department_id: params.departmentId,
        device_uid: getOrCreateInstallId(),
        replace_device: params.replaceDevice ?? false,
        ward: params.ward,
      }),
    },
  );
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `Mediboard request failed: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.ok) {
    const message =
      (body as Partial<MediboardErrorResponse>)?.message ??
      `${res.status} ${res.statusText}`;
    if (res.status === 409) {
      throw new MediboardDeviceConflictError(message);
    }
    throw new Error(`Mediboard request failed: ${message}`);
  }
  const envelope = body as {
    success?: boolean;
    data?: { device?: MediboardSetupDevice };
  };
  if (!envelope.success || !envelope.data?.device) {
    throw new Error(
      "Mediboard request returned an unexpected response",
    );
  }
  return envelope.data.device;
}

export async function registerMediboardDevice(
  hospitalId: string,
  params: {
    departmentId: number;
    replaceDevice?: boolean;
    ward: {
      id: string;
      name: string;
      code: string;
      capacity: number;
      floor: string;
    };
  },
): Promise<MediboardSetupDevice> {
  return withColdStartRetry(() =>
    registerMediboardDeviceOnce(hospitalId, params),
  );
}

export function mediboardSetupWardToLocal(
  device: MediboardSetupDevice,
): Ward {
  return {
    id: device.ward.id,
    name: device.ward.name,
    code: device.ward.code,
    capacity: device.ward.capacity,
    floor: device.ward.floor,
  };
}

// ─── SYNC (day-to-day, post-onboarding) ────────────────────────────────────────
// Builds the exact payload shape confirmed live, 2026-08-24, against
// `POST hospital/[hospital_id]/ward/[ward_id]/sync` — singular `ward`
// (BedLog is one-ward-per-device), `hospitalName` as `{id, name}` (an
// unregistered deviceId is what actually crashed this endpoint before, not
// this shape — see mediboard_open_questions memory), and
// `patient_hospital_number` in snake_case on each bed, matching what
// `/device` and `/sync` both use (the plain bed-fetch endpoint differs —
// also logged as a known inconsistency).
//
// The top-level `patients` array was disabled 2026-08-24 through 2026-08-27
// (any entry with a real `hospitalNumber` crashed their server with a 500 —
// see mediboard_open_questions memory, item 0) and re-enabled permanently
// 2026-08-28 once the developer fixed the server-side bind-parameter bug
// causing it — confirmed live on two separate wards, with a real admission
// persisting through an independent re-fetch, not just an echoed response.
//
// The bed-level `patient_hospital_number` field is a separate mechanism —
// confirmed live, 2026-08-24, that Mediboard requires it to be non-null for
// an "occupied" bed to persist as occupied (send `null` and they silently
// downgrade the bed back to "available"). It also appears "sticky" once set
// — a later `null` doesn't clear a previously-sent real value (confirmed
// live, 2026-08-27, not yet re-checked since the patients-array fix landed).
export function buildMediboardSyncPayload(
  config: AppConfig,
  beds: Bed[],
  patients: Patient[],
) {
  const ward = config.wards[0];
  const patientById = new Map(patients.map((p) => [p.id, p]));
  return {
    deviceId: config.deviceId,
    // Mediboard refuses a sync from any install other than the one attached
    // to the ward — this is what keeps ward/device strictly one-to-one.
    deviceUid: getOrCreateInstallId(),
    deviceLabel:
      config.deviceLabel ?? `${ward?.name ?? "Ward"} - Bed Log`,
    generatedAt: new Date().toISOString(),
    hospitalName: {
      id: config.hospitalId ?? "",
      name: config.hospitalName,
    },
    ward: ward
      ? {
          id: ward.id,
          name: ward.name,
          code: ward.code,
          capacity: ward.capacity,
          bedCount: beds.filter((b) => b.wardId === ward.id).length,
          floor: ward.floor,
        }
      : null,
    beds: beds.map((b) => ({
      id: b.id,
      number: b.number,
      wardId: b.wardId,
      status: b.status,
      patient_hospital_number: b.patientId
        ? (patientById.get(b.patientId)?.hospitalNumber ?? null)
        : null,
      updatedAt: b.updatedAt,
    })),
    // Every patient always sends its original admission entry (own `id`,
    // `status: "admitted"`) — confirmed live, 2026-08-28, that a matching
    // real `id` coming through is the only way an admission actually
    // registers on Mediboard's side; flipping the bed's own status/
    // patient_hospital_number to "available"/null does nothing on its own.
    // Sent unconditionally (even for an already-discharged patient) so the
    // admission event still reaches Mediboard even if a patient is admitted
    // and discharged again before any sync in between ever fires.
    //
    // A discharged patient ALSO sends a SECOND, separate entry — its own
    // distinct id, not a mutation of the admission entry above — carrying
    // the real outcome (`dischargeType`) as `status` plus a new `updatedAt`
    // (the local `dischargedAt`). This is the developer's fix, confirmed
    // live, 2026-08-31: reusing the admission's own `id` with a changed
    // `status` NEVER closed the admission for any outcome other than the
    // literal string "discharged" (tested "deceased," "lama" — both
    // silently no-op'd, admission stayed open). Sending a fresh id instead
    // — same hospitalNumber/bedId/wardId, `admittedAt` unchanged — DOES
    // close the admission correctly AND preserves the specific outcome
    // distinctly (confirmed via a fresh `GET /device`: both the original
    // "admitted" entry and the new outcome entry persist side by side).
    // The derived id is a stable suffix on the patient's own id, not
    // randomly regenerated, so repeat/idempotent syncs don't spawn a new
    // outcome record every time.
    //
    // A patient AWAITING A BED is not pushed at all. Mediboard created that
    // admission and owns it until a nurse assigns a bed here; once a bed is
    // set the record is pushed like any other admission and the server
    // completes (never duplicates) its own open row.
    patients: patients.flatMap((p) => {
      if (!p.bedId) return [];
      const admission = {
        id: p.id,
        hospitalNumber: p.hospitalNumber,
        admittedAt: p.admittedAt,
        bedId: p.bedId,
        wardId: p.wardId,
        status: "admitted",
      };
      if (p.status !== "discharged") return [admission];
      return [
        admission,
        {
          id: `${p.id}-close`,
          hospitalNumber: p.hospitalNumber,
          admittedAt: p.admittedAt,
          updatedAt: p.dischargedAt ?? Date.now(),
          bedId: p.bedId,
          wardId: p.wardId,
          status: p.dischargeType ?? "discharged",
        },
      ];
    }),
    summary: {
      totalBeds: beds.length,
      occupiedBeds: beds.filter((b) => b.status === "occupied")
        .length,
      availableBeds: beds.filter((b) => b.status === "available")
        .length,
      admittedPatients: patients.filter(
        (p) => p.status === "admitted",
      ).length,
    },
  };
}

async function syncMediboardWardOnce(
  hospitalId: string,
  wardId: string,
  payload: unknown,
): Promise<MediboardSetupDevice | null> {
  const res = await fetch(
    `${MEDIBOARD_BASE_URL}/hospital/${encodeURIComponent(hospitalId)}/ward/${encodeURIComponent(wardId)}/sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `Mediboard request failed: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.ok) {
    const message =
      (body as Partial<MediboardErrorResponse>)?.message ??
      `${res.status} ${res.statusText}`;
    throw new Error(`Mediboard request failed: ${message}`);
  }
  const envelope = body as {
    success?: boolean;
    data?: { deviceState?: MediboardSetupDevice };
  };
  if (!envelope.success) {
    throw new Error(
      "Mediboard request returned an unexpected response",
    );
  }
  // Mediboard answers every sync with the ward's authoritative state after
  // commit — the caller reconciles its bed list from it.
  return envelope.data?.deviceState ?? null;
}

export async function syncMediboardWard(
  hospitalId: string,
  wardId: string,
  payload: unknown,
): Promise<MediboardSetupDevice | null> {
  return withColdStartRetry(() =>
    syncMediboardWardOnce(hospitalId, wardId, payload),
  );
}

// ─── PIN ────────────────────────────────────────────────────────────────────────
// Confirmed live, 2026-08-24: `POST .../pin/verify` returns a real HTTP
// status per outcome — 200 (correct), 401 (wrong PIN), 404 (no PIN has
// ever been set for this ward) — rather than a graceful `valid:false` for
// every failure case, so those three have to be distinguished by status
// code rather than by throwing on any non-2xx response.
export type MediboardPinVerifyOutcome = "valid" | "invalid" | "not_set";

async function verifyMediboardPinOnce(
  hospitalId: string,
  wardId: string,
  pin: string,
): Promise<MediboardPinVerifyOutcome> {
  const res = await fetch(
    `${MEDIBOARD_BASE_URL}/hospital/${encodeURIComponent(hospitalId)}/ward/${encodeURIComponent(wardId)}/pin/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    },
  );
  if (res.status === 404) return "not_set";
  if (res.status === 401) return "invalid";
  if (!res.ok) {
    throw new Error(
      `Mediboard request failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as {
    success?: boolean;
    data?: { valid?: boolean };
  };
  return body.success && body.data?.valid ? "valid" : "invalid";
}

export async function verifyMediboardPin(
  hospitalId: string,
  wardId: string,
  pin: string,
): Promise<MediboardPinVerifyOutcome> {
  return withColdStartRetry(() =>
    verifyMediboardPinOnce(hospitalId, wardId, pin),
  );
}

async function setMediboardPinOnce(
  hospitalId: string,
  wardId: string,
  pin: string,
): Promise<void> {
  const res = await fetch(
    `${MEDIBOARD_BASE_URL}/hospital/${encodeURIComponent(hospitalId)}/ward/${encodeURIComponent(wardId)}/pin`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    },
  );
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `Mediboard request failed: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.ok) {
    const message =
      (body as Partial<MediboardErrorResponse>)?.message ??
      `${res.status} ${res.statusText}`;
    throw new Error(`Mediboard request failed: ${message}`);
  }
  const envelope = body as { success?: boolean };
  if (!envelope.success) {
    throw new Error(
      "Mediboard request returned an unexpected response",
    );
  }
}

export async function setMediboardPin(
  hospitalId: string,
  wardId: string,
  pin: string,
): Promise<void> {
  return withColdStartRetry(() =>
    setMediboardPinOnce(hospitalId, wardId, pin),
  );
}

// ─── DETACH ───────────────────────────────────────────────────────────────────
// Releases this ward on Mediboard so another device can be set up for it.
// PIN-guarded server-side; Mediboard also refuses the call if the ward is
// attached to a different install than this one.
async function detachMediboardDeviceOnce(
  hospitalId: string,
  wardId: string,
  pin: string,
): Promise<void> {
  const res = await fetch(
    `${MEDIBOARD_BASE_URL}/hospital/${encodeURIComponent(hospitalId)}/ward/${encodeURIComponent(wardId)}/device`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, device_uid: getOrCreateInstallId() }),
    },
  );
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `Mediboard request failed: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.ok) {
    const message =
      (body as Partial<MediboardErrorResponse>)?.message ??
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
}

export async function detachMediboardDevice(
  hospitalId: string,
  wardId: string,
  pin: string,
): Promise<void> {
  return withColdStartRetry(() =>
    detachMediboardDeviceOnce(hospitalId, wardId, pin),
  );
}
