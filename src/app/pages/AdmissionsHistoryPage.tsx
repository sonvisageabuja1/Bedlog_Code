import { useState } from "react";
import type { Bed, DischargeType, Patient, Ward } from "../types";
import { bedDisplayNumber } from "../lib/beds";
import { timeAgo } from "../lib/time";
import { Row } from "../components/Row";

// ─── ADMISSIONS HISTORY PAGE — from 06AdmissionsHistory Figma design ─────────

export function AdmissionsHistoryPage({
  patients,
  beds,
  wards,
  onBack,
}: {
  patients: Patient[];
  beds: Bed[];
  wards: Ward[];
  onBack: () => void;
}) {
  const [selectedPatient, setSelectedPatient] =
    useState<Patient | null>(null);

  // All patients, newest first
  const sorted = [...patients].sort(
    (a, b) => b.admittedAt - a.admittedAt,
  );

  // Patients admitted from app-client without a bed have no bed id yet.
  const getBed = (id: string | null) =>
    id ? beds.find((b) => b.id === id) : undefined;
  const getWard = (id: string) =>
    wards.find((w) => w.id === id);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header — Frame: back button + title */}
      <div className="flex-shrink-0 flex items-center gap-[12px] px-5 py-[10px] border-b border-black/10 bg-white">
        <button
          onClick={onBack}
          className="bg-[#fbf9f9] flex items-center justify-center p-[8px] rounded-[8px] shrink-0 relative active:opacity-70"
        >
          <div
            aria-hidden
            className="absolute border border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[8px]"
          />
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 16 16"
          >
            <path
              d="M13 8H3M3 8L7 4M3 8L7 12"
              stroke="#3469B2"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        <p className="font-semibold leading-[24px] text-[#0f172a] text-[16px] whitespace-nowrap">
          Admissions History
        </p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Container — blue-tinted card wrapping the list */}
        <div
          className="relative rounded-[14px] w-full"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
          }}
        >
          <div
            aria-hidden
            className="absolute border-[0.726px] border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[14px]"
          />
          <div className="p-[10.726px] flex flex-col gap-[12px]">
            {sorted.length === 0 && (
              <p
                className="text-center text-[13px] text-[#8e8e93] py-8"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                No admissions recorded yet
              </p>
            )}

            {sorted.map((p) => {
              const bed = getBed(p.bedId);
              const ward = getWard(p.wardId);
              return (
                /* AdmissionRow — bg-white, drop-shadow, rounded-[12px], border-[#e5e5ea] */
                <div
                  key={p.id}
                  className="bg-white relative rounded-[12px] w-full"
                  style={{
                    boxShadow: "0px 4px 6px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute border border-[#e5e5ea] border-solid inset-0 pointer-events-none rounded-[12px]"
                  />
                  <div className="flex flex-row items-center justify-between p-[12px]">
                    {/* patient-profile — 3 lines */}
                    <div className="flex flex-col gap-[4px] items-start flex-1 min-w-0">
                      {/* Name — Plus Jakarta Sans Bold 14px #1c1c1e */}
                      <p
                        className="font-bold text-[#1c1c1e] text-[14px] leading-normal truncate"
                        style={{
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        Patient {p.hospitalNumber}
                      </p>
                      {/* Ward · Bed · MRN — Inter Medium 13px #8e8e93 */}
                      <p className="font-medium text-[#8e8e93] text-[13px] leading-normal truncate">
                        {ward?.name ?? "Unknown Ward"} ·{" "}
                        {bed
                          ? bedDisplayNumber(beds, bed.id)
                          : "—"}{" "}
                        · MRN {p.hospitalNumber}
                      </p>
                      {/* Time ago — Inter Medium 12px #8e8e93 */}
                      <p className="font-medium text-[#8e8e93] text-[12px] leading-normal">
                        Admitted {timeAgo(p.admittedAt)}
                      </p>
                    </div>

                    {/* view-action pill — bg-[#ebf8fa], text-[#0a8491], Inter SemiBold 13px */}
                    <button
                      onClick={() => setSelectedPatient(p)}
                      className="bg-[#ebf8fa] flex items-center px-[16px] py-[8px] rounded-[100px] shrink-0 ml-3 active:opacity-70"
                    >
                      <p className="font-semibold text-[#0a8491] text-[13px] leading-normal whitespace-nowrap">
                        View
                      </p>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Patient detail modal — shown on "View" tap */}
      {selectedPatient &&
        (() => {
          const p = selectedPatient;
          const bed = getBed(p.bedId);
          const ward = getWard(p.wardId);
          const DISCHARGE_LABELS: Record<
            DischargeType,
            { label: string; pillBg: string; color: string }
          > = {
            discharged: {
              label: "Discharged",
              pillBg: "#edf5ff",
              color: "#3469b2",
            },
            deceased: {
              label: "Deceased",
              pillBg: "#ffebee",
              color: "#dd2237",
            },
            lama: {
              label: "LAMA",
              pillBg: "#fff4ed",
              color: "#ff7f0b",
            },
            absconded: {
              label: "Absconded",
              pillBg: "#f1f5f9",
              color: "#8d9094",
            },
            transferred: {
              label: "Transferred",
              pillBg: "#eaddff",
              color: "#8b5cf6",
            },
          };
          const statusMeta = p.dischargeType
            ? DISCHARGE_LABELS[p.dischargeType]
            : null;
          return (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center p-4"
              style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
              onPointerDown={() => setSelectedPatient(null)}
            >
              <div
                className="bg-white rounded-[16px] w-full shadow-2xl"
                style={{ maxWidth: "420px" }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/10">
                  <p
                    className="font-bold text-[#1c1c1e] text-[15px]"
                    style={{
                      fontFamily:
                        "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    Patient {p.hospitalNumber}
                  </p>
                  <button
                    onClick={() => setSelectedPatient(null)}
                    className="p-2 rounded-full text-[#8e8e93] active:opacity-70"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <Row label="MRN" value={p.hospitalNumber} />
                  <Row label="Ward" value={ward?.name ?? "—"} />
                  <Row
                    label="Bed"
                    value={
                      bed ? bedDisplayNumber(beds, bed.id) : "—"
                    }
                  />
                  <Row
                    label="Admitted"
                    value={new Date(
                      p.admittedAt,
                    ).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  />
                  {p.dischargedAt && (
                    <Row
                      label="Discharged"
                      value={new Date(
                        p.dischargedAt,
                      ).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wider">
                      Status
                    </p>
                    {p.status === "admitted" ? (
                      <span
                        className="bg-[#ebf8fa] px-3 py-1 rounded-full text-[12px] font-bold text-[#2e7d32]"
                        style={{
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        Admitted
                      </span>
                    ) : statusMeta ? (
                      <span
                        className="px-3 py-1 rounded-full text-[12px] font-bold"
                        style={{
                          backgroundColor: statusMeta.pillBg,
                          color: statusMeta.color,
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
