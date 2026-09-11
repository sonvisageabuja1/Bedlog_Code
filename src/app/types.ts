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
  bedCount: number;
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
  bedId: string;
  wardId: string;
  status: "admitted" | "discharged";
  dischargeType?: DischargeType;
  dischargedAt?: number;
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
