import bedIconAvailable from "@/assets/bed-icons/Available.svg";
import bedIconReserved from "@/assets/bed-icons/Reserved.svg";
import bedIconOccupied from "@/assets/bed-icons/Occupied.svg";
import bedIconMaintenance from "@/assets/bed-icons/Maintenance.svg";
import bedIconCleaning from "@/assets/bed-icons/Cleaning.svg";
import type { BedStatus, DischargeType } from "./types";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const DISCHARGE_TTL = 30 * 60 * 1000;

export const BED_STATUS_META: Record<
  BedStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  available: {
    label: "Available",
    color: "#059669",
    bg: "#d1fae5",
    border: "#6ee7b7",
  },
  occupied: {
    label: "Occupied",
    color: "#dc2626",
    bg: "#fee2e2",
    border: "#fca5a5",
  },
  cleaning: {
    label: "Cleaning",
    color: "#d97706",
    bg: "#fef3c7",
    border: "#fcd34d",
  },
  reserved: {
    label: "Reserved",
    color: "#7c3aed",
    bg: "#ede9fe",
    border: "#c4b5fd",
  },
  maintenance: {
    label: "Maint.",
    color: "#b45309",
    bg: "#ffedd5",
    border: "#fdba74",
  },
};


// ─── BED MAPS ─────────────────────────────────────────────────────────────────

// New illustrated bed icons (per-status artwork, colors baked in) — replaces
// the flat recolorable BedMapsBedIcon for statuses that have dedicated art.
export const BED_MAPS_ICON_SRC: Partial<Record<BedStatus, string>> = {
  available: bedIconAvailable,
  reserved: bedIconReserved,
  occupied: bedIconOccupied,
  maintenance: bedIconMaintenance,
  cleaning: bedIconCleaning,
};

// Status meta matching Figma legend colors
export const BED_MAPS_STATUS: Record<
  BedStatus,
  { color: string; label: string; hasIcon: boolean }
> = {
  occupied: {
    color: "#00BD6D",
    label: "Occupied",
    hasIcon: true,
  },
  maintenance: {
    color: "#FE9A00",
    label: "Maintenance",
    hasIcon: true,
  },
  reserved: {
    color: "#8464ba",
    label: "Reserved",
    hasIcon: true,
  },
  available: {
    color: "#b4b4b4",
    label: "Available",
    hasIcon: true,
  },
  cleaning: {
    color: "#00A6F4",
    label: "Cleaning",
    hasIcon: true,
  },
};

export const BED_MAPS_LEGEND = [
  { color: "#00BD6D", label: "Occupied" },
  { color: "#FE9A00", label: "Maintenance" },
  { color: "#8464ba", label: "Reserved" },
  { color: "#00A6F4", label: "Cleaning" },
  { color: "#ebebeb", label: "Available" },
] as const;

// ─── ADMISSIONS / ACTIVITY ────────────────────────────────────────────────────

export const ACTIVITY_META: {
  type: DischargeType | "admitted";
  label: string;
  pillBg: string;
  pillColor: string;
}[] = [
  {
    type: "admitted",
    label: "Admitted",
    pillBg: "#ebf8fa",
    pillColor: "#2e7d32",
  },
  {
    type: "discharged",
    label: "Discharged",
    pillBg: "#edf5ff",
    pillColor: "#3469b2",
  },
  {
    type: "deceased",
    label: "Deceased",
    pillBg: "#ffebee",
    pillColor: "#dd2237",
  },
  {
    type: "lama",
    label: "LAMA",
    pillBg: "#fff4ed",
    pillColor: "#ff7f0b",
  },
  {
    type: "absconded",
    label: "Absconded",
    pillBg: "#f1f5f9",
    pillColor: "#8d9094",
  },
  {
    type: "transferred",
    label: "Transferred",
    pillBg: "#eaddff",
    pillColor: "#8b5cf6",
  },
];
