import React from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type BedStatus =
  | "available"
  | "occupied"
  | "cleaning"
  | "reserved"
  | "maintenance";
export type Page =
  | "dashboard"
  | "bedmaps"
  | "admissions"
  | "reports"
  | "admissions-history"
  | "settings";
export type DischargeType =
  | "discharged"
  | "deceased"
  | "lama"
  | "absconded"
  | "transferred";

export interface Ward {
  id: string;
  name: string;
  code: string;
  // Declared capacity from Mediboards. Not the number of beds — the beds
  // list is the source of truth for that.
  capacity: number;
  floor: string;
}
export interface Bed {
  id: string;
  number: string;
  wardId: string;
  status: BedStatus;
  patientId?: string;
  updatedAt: number;
}
export interface Patient {
  id: string;
  hospitalNumber: string;
  admittedAt: number;
  // null while the admission is AWAITING A BED: the Focal Person admitted
  // the patient to this ward from app-client without knowing the bed, and a
  // nurse here completes it by assigning one (see isAwaitingBed). Every
  // admission the device itself creates always has a bed.
  bedId: string | null;
  wardId: string;
  status: "admitted" | "discharged";
  dischargeType?: DischargeType;
  dischargedAt?: number;
  // Mediboard's admissions row id, set on records adopted from a sync reply
  // (or the onboarding seed). It is how an awaiting-bed record is matched
  // against later replies — hospital number alone is ambiguous once a
  // patient has been admitted more than once.
  serverAdmissionId?: string;
  // Patient name as registered on Mediboards, when known. The device never
  // asks for a name itself; this only exists so a nurse can recognise a
  // patient sent from A&E in the awaiting-bed list.
  name?: string;
}
export interface AppConfig {
  hospitalName: string;
  hospitalId?: string; // Mediboard's hospital identifier, set once linked during onboarding
  wards: Ward[];
  syncEndpoint?: string;
  syncEnabled?: boolean; // enables the periodic catch-up sync (see App.tsx)
  deviceId: string; // stable per-install identity, generated on first run
  deviceLabel?: string; // optional human label, e.g. "Ward 3 – Bed Station 1"
}
export interface KbCtxType {
  isOpen: boolean;
  activeEl: React.MutableRefObject<HTMLInputElement | null>;
  // Whether the field currently focused is numeric-only (e.g. bed count,
  // hospital number) — the keyboard defaults to its "123" view for these
  // instead of requiring a manual tap to switch from letters.
  numeric: boolean;
  openFor: (el: HTMLInputElement, numeric?: boolean) => void;
  dismiss: () => void;
}

export type ActivityFilter = "today" | "week" | "month" | "all";
