import type { Patient } from "../types";

// An admission created from app-client with department + ward only. It is
// a real, open admission — it counts as admitted everywhere — but the
// patient has no bed yet; a nurse on this device assigns one.
export function isAwaitingBed(p: Patient): boolean {
  return p.status === "admitted" && !p.bedId;
}

// Patients in this ward still waiting for a bed, oldest admission first —
// the order a nurse would want to work through them.
export function awaitingBedPatients(patients: Patient[]): Patient[] {
  return patients
    .filter(isAwaitingBed)
    .sort((a, b) => a.admittedAt - b.admittedAt);
}
