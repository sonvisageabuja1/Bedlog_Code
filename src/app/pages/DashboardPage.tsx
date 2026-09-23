import { useEffect, useRef, useState } from "react";
import type {
  Bed,
  DischargeType,
  Page,
  Patient,
  Ward,
} from "../types";
import { bedDisplayNumber } from "../lib/beds";
import { isAwaitingBed } from "../lib/patients";
import { timeAgo } from "../lib/time";
import { CircularStat } from "../components/CircularStat";
import { Toast } from "../components/Toast";
import { KeyboardPad } from "../components/VirtualKeyboard";

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────

export function DashboardPage({
  beds,
  patients,
  wards,
  onAdmit,
  onAssignBed,
  onDischarge,
  onNavigate,
}: {
  beds: Bed[];
  patients: Patient[];
  wards: Ward[];
  onAdmit: (
    hospitalNumber: string,
    bedId: string,
  ) => { ok: boolean; error?: string };
  // Completes an admission opened from app-client without a bed.
  onAssignBed: (
    patientId: string,
    bedId: string,
  ) => { ok: boolean; error?: string };
  onDischarge: (
    patientId: string,
    bedId: string,
    type: DischargeType,
  ) => void;
  onNavigate: (page: Page) => void;
}) {
  const [hospitalNumber, setHospitalNumber] = useState("");
  const [selectedBedId, setSelectedBedId] = useState("");
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  // Hospital number entry — the only keyboard-needing field on this page —
  // opens in its own self-contained modal (large input + its own KeyboardPad)
  // rather than the global bottom-docked keyboard. This page's spacing is
  // built entirely on vh-relative clamp() so it can shrink to fit any screen
  // without ever scrolling; the global keyboard makes room for itself by
  // shrinking <main> via padding, which vh units can't detect, so opening it
  // here made the rest of this page's layout compress into itself. A modal
  // sidesteps that: it sits on its own fixed(inset-0) layer above everything,
  // so the page underneath never has to resize at all. Confirmed 2026-09-10,
  // live on real kiosk hardware.
  const [hnModalOpen, setHnModalOpen] = useState(false);
  const hnModalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hnModalOpen) hnModalInputRef.current?.focus();
  }, [hnModalOpen]);

  const showToast = (
    msg: string,
    type: "success" | "error",
  ) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const hnTrimmed = hospitalNumber.trim();

  // Match against currently admitted patients (case-insensitive)
  const existingPatient = hnTrimmed
    ? patients.find(
        (p) =>
          p.status === "admitted" &&
          p.hospitalNumber.toLowerCase() ===
            hnTrimmed.toLowerCase(),
      )
    : null;

  // Three cases for a typed hospital number:
  //  - awaiting a bed: admitted from app-client to this ward, no bed yet —
  //    the bed picker completes that admission (no discharge from here);
  //  - existing: already in a bed — bed is read-only, outcomes apply;
  //  - new: nobody admitted under that number — a fresh admission.
  const isAwaiting = !!existingPatient && isAwaitingBed(existingPatient);
  const isExisting = !!existingPatient && !isAwaiting;
  const isNew = !!hnTrimmed && !existingPatient;
  const bedFieldActive = !!hnTrimmed;

  // For existing patient: derive bed from patient record; for new: use dropdown selection
  const effectiveBedId = isExisting
    ? (existingPatient?.bedId ?? "")
    : selectedBedId;
  const selectedBed = beds.find((b) => b.id === effectiveBedId);

  const canAdmit =
    (isNew || isAwaiting) && selectedBed?.status === "available";
  const canDischarge = isExisting && !!existingPatient;

  const stats = {
    total: beds.length,
    occupied: beds.filter((b) => b.status === "occupied")
      .length,
    available: beds.filter((b) => b.status === "available")
      .length,
  };

  const handleAdmit = () => {
    if (!canAdmit) {
      showToast(
        "Select an available bed to admit the patient",
        "error",
      );
      return;
    }
    const result = isAwaiting
      ? onAssignBed(existingPatient!.id, selectedBedId)
      : onAdmit(hnTrimmed, selectedBedId);
    if (!result.ok) {
      showToast(result.error ?? "Could not admit", "error");
      return;
    }
    showToast(
      isAwaiting
        ? `Patient ${hnTrimmed} assigned to ${bedDisplayNumber(beds, selectedBed!.id)} — admission complete`
        : `Patient ${hnTrimmed} admitted to ${bedDisplayNumber(beds, selectedBed!.id)}`,
      "success",
    );
    setHospitalNumber("");
    setSelectedBedId("");
  };

  const handleAction = (type: DischargeType) => {
    if (!canDischarge) {
      showToast(
        "Hospital number not found in admitted patients",
        "error",
      );
      return;
    }
    onDischarge(
      existingPatient!.id,
      // canDischarge guarantees an in-bed patient, never an awaiting one.
      existingPatient!.bedId!,
      type,
    );
    const labels: Record<DischargeType, string> = {
      discharged: "Discharged Patient",
      deceased: "Marked Deceased",
      lama: "LAMA recorded",
      absconded: "Absconded recorded",
      transferred: "Transferred",
    };
    showToast(
      `${existingPatient!.hospitalNumber} — ${labels[type]}`,
      "success",
    );
    setHospitalNumber("");
    setSelectedBedId("");
  };

  // Reset bed selection when HN changes so stale picks don't persist
  const prevHnRef = useRef("");
  if (prevHnRef.current !== hnTrimmed) {
    prevHnRef.current = hnTrimmed;
    if (selectedBedId) setSelectedBedId("");
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-[clamp(8px,1.6vh,16px)] px-5 pt-[clamp(6px,1.2vh,10px)] pb-[clamp(6px,1.2vh,14px)] overflow-y-auto">
      {/* "Quick Admission" title — matches design's absolute label */}
      <p className="font-semibold leading-[24px] text-[#0f172a] text-[16px] shrink-0">
        Quick Admission
      </p>

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Quick Admission Card — grows to absorb the leftover space between the title and the Admitting Capacity row, compresses on short screens */}
      <div
        className="flex-1 min-h-0 rounded-[14px] border border-black/10 px-[clamp(14px,2.2vw,24px)] py-[clamp(12px,2vh,20px)] flex flex-col justify-between gap-[clamp(10px,1.8vh,18px)]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(52,105,178,0.2) 0%, rgba(52,105,178,0.2) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
        }}
      >
        {/* Patient Hospital Number */}
        <div className="flex flex-col gap-[8px] flex-1 min-h-0">
          <p className="font-semibold leading-[26px] text-[#0a276a] text-[24px] tracking-[0.3px] uppercase shrink-0">
            Patient Hospital Number
          </p>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              setHnModalOpen(true);
            }}
            className="bg-white flex-1 min-h-[44px] max-h-[88px] rounded-[10px] relative overflow-hidden border-2 border-[#3469b2] flex items-center px-[14px]"
          >
            <span
              className={`text-[14px] font-medium ${hospitalNumber ? "text-[#0f172a]" : "text-[rgba(15,23,42,0.5)]"}`}
            >
              {hospitalNumber || "e.g. 10003"}
            </span>
            {isAwaiting && (
              <span
                className="ml-auto shrink-0 text-[12px] font-semibold px-[8px] py-[2px] rounded-full"
                style={{ backgroundColor: "#fef3c7", color: "#b45309" }}
              >
                Awaiting bed
              </span>
            )}
          </button>
          {isAwaiting && (
            <p className="shrink-0 text-[12px] leading-[16px] text-[#b45309] font-medium">
              {existingPatient!.name ? `${existingPatient!.name} · ` : ""}
              admitted from Mediboards {timeAgo(existingPatient!.admittedAt)}{" "}
              without a bed — pick a bed below to complete the admission.
            </p>
          )}
        </div>

        {/* Bed Number */}
        <div className="flex flex-col gap-[8px] flex-1 min-h-0">
          <p className="font-semibold leading-[26px] text-[#0a276a] text-[24px] tracking-[0.3px] uppercase flex items-center gap-2 shrink-0">
            Bed Number
            {isExisting && selectedBed && (
              <span className="font-normal text-[#00bd6d] normal-case tracking-normal text-[12px]">
                — auto-filled
              </span>
            )}
          </p>

          {/* Existing patient: read-only populated field */}
          {isExisting ? (
            <div className="bg-white flex-1 min-h-[44px] max-h-[88px] rounded-[10px] border-2 border-[#3469b2] px-[14px] flex items-center gap-[10px]">
              <p className="text-[14px] font-semibold text-[#0f172a] flex-1">
                {selectedBed
                  ? bedDisplayNumber(beds, selectedBed.id)
                  : "—"}
              </p>
              {selectedBed && (
                <span
                  className="text-[12px] font-medium px-[8px] py-[2px] rounded-full"
                  style={{
                    backgroundColor: "#d0fae5",
                    color: "#00bd6d",
                  }}
                >
                  Occupied
                </span>
              )}
            </div>
          ) : (
            /* New patient or empty: dropdown (disabled until HN is typed) */
            <div
              className={`bg-white flex-1 min-h-[44px] max-h-[88px] rounded-[10px] border-2 relative flex items-center transition-colors ${bedFieldActive ? "border-[#3469b2]" : "border-[#cbd5e1] opacity-50"}`}
            >
              <select
                value={selectedBedId}
                onChange={(e) =>
                  setSelectedBedId(e.target.value)
                }
                disabled={!bedFieldActive}
                className="absolute inset-0 w-full h-full bg-transparent px-[12px] pr-[40px] text-[14px] font-medium appearance-none focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                style={{
                  color: selectedBedId
                    ? "#0f172a"
                    : "rgba(15,23,42,0.5)",
                }}
              >
                <option value="">
                  {bedFieldActive
                    ? "Select available bed"
                    : "Enter HN first"}
                </option>
                {bedFieldActive &&
                  wards.map((w) => {
                    const wardBeds = beds.filter(
                      (b) =>
                        b.wardId === w.id &&
                        b.status === "available",
                    );
                    if (wardBeds.length === 0) return null;
                    return (
                      <optgroup
                        key={w.id}
                        label={`${w.name} (Floor ${w.floor})`}
                      >
                        {wardBeds.map((b) => (
                          <option key={b.id} value={b.id}>
                            {bedDisplayNumber(beds, b.id)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
              </select>
              <div className="absolute right-[10px] pointer-events-none">
                <svg
                  width="22"
                  height="22"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 flex-1 min-h-0 items-stretch">
          {/* Admit — only relevant for new patients */}
          <button
            onClick={handleAdmit}
            className="flex-1 min-w-[100px] min-h-[44px] max-h-[88px] rounded-[10px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              backgroundColor: "#156f48",
              opacity: canAdmit ? 1 : 0.35,
            }}
          >
            <span className="font-semibold leading-[20px] text-white text-[16px]">
              {isAwaiting ? "Assign bed" : "Admit"}
            </span>
          </button>
          {/* Discharge/status — only relevant for existing patients */}
          <button
            onClick={() => handleAction("discharged")}
            className="flex-1 min-w-[100px] min-h-[44px] max-h-[88px] rounded-[10px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              backgroundColor: "#2138bc",
              opacity: canDischarge ? 1 : 0.35,
              border: "0.726px solid rgba(0,0,0,0.1)",
            }}
          >
            <span className="font-semibold leading-[20px] text-white text-[16px]">
              Discharge
            </span>
          </button>
          <button
            onClick={() => handleAction("deceased")}
            className="flex-1 min-w-[100px] min-h-[44px] max-h-[88px] rounded-[10px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              backgroundColor: "#dd2237",
              opacity: canDischarge ? 1 : 0.35,
              border: "0.726px solid #dd2237",
            }}
          >
            <span className="font-semibold leading-[20px] text-white text-[16px]">
              Deceased
            </span>
          </button>
          <button
            onClick={() => handleAction("lama")}
            className="flex-1 min-w-[100px] min-h-[44px] max-h-[88px] rounded-[10px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              backgroundColor: "#ff662f",
              opacity: canDischarge ? 1 : 0.35,
              border: "0.726px solid #ff662f",
            }}
          >
            <span className="font-semibold leading-[20px] text-white text-[16px]">
              LAMA
            </span>
          </button>
          <button
            onClick={() => handleAction("absconded")}
            className="flex-1 min-w-[100px] min-h-[44px] max-h-[88px] rounded-[10px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              opacity: canDischarge ? 1 : 0.35,
              border: "0.726px solid #8d9094",
            }}
          >
            <span className="font-semibold leading-[20px] text-white text-[16px]">
              Absconded
            </span>
          </button>
        </div>
      </div>

      {/* Admitting Capacity Row — responsive: wraps instead of overlapping on narrow/short kiosk screens */}
      <div className="shrink-0 bg-[rgba(52,105,178,0.05)] rounded-[10.221px] border border-black/10 px-[clamp(14px,2vw,20px)] py-[clamp(8px,1.5vh,14px)] flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* "Admitting Capacity" label — two lines, bold */}
        <div className="shrink-0">
          <p className="font-semibold text-[#0f172a] text-[12px] leading-[16px]">
            Admitting
          </p>
          <p className="font-semibold text-[#0f172a] text-[12px] leading-[16px]">
            Capacity
          </p>
        </div>

        {/* White vertical divider */}
        <div className="bg-white w-px self-stretch rounded-full shrink-0 hidden sm:block" />

        {/* Total Beds */}
        <div className="flex items-center gap-2 shrink-0">
          <p
            className="text-[#2b2b2b] text-[12px] font-semibold whitespace-nowrap"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Total Beds
          </p>
          <CircularStat
            value={stats.total}
            total={stats.total}
            ringColor="#6969D3"
            isFull
            size={52}
          />
        </div>

        {/* White divider */}
        <div className="bg-white w-px self-stretch rounded-full shrink-0 hidden sm:block" />

        {/* Occupied Beds */}
        <div className="flex items-center gap-2 shrink-0">
          <p
            className="text-[#2b2b2b] text-[12px] font-semibold whitespace-nowrap"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Occupied Beds
          </p>
          <CircularStat
            value={stats.occupied}
            total={stats.total}
            ringColor="#FF7F0B"
            size={52}
          />
        </div>

        {/* White divider */}
        <div className="bg-white w-px self-stretch rounded-full shrink-0 hidden sm:block" />

        {/* Available Beds */}
        <div className="flex items-center gap-2 shrink-0">
          <p
            className="text-[#2b2b2b] text-[12px] font-semibold whitespace-nowrap"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Available Beds
          </p>
          <CircularStat
            value={stats.available}
            total={stats.total}
            ringColor="#2E7D32"
            size={52}
          />
        </div>

        {/* Reports button — white bg, blue border, blue text. flex-grow on wide screens, full-width on its own line if wrapped */}
        <button
          onClick={() => onNavigate("reports")}
          className="shrink-0 ml-auto bg-white border border-[#3469b2] rounded-[10px] px-[13px] py-[10px] flex items-center justify-center active:opacity-80 transition-opacity"
          style={{ minWidth: "84px" }}
        >
          <span className="font-medium leading-[18px] text-[#3469b2] text-[13px] whitespace-nowrap">
            Reports
          </span>
        </button>
      </div>

      {/* Hospital-number entry modal — see the note above hnModalOpen for
          why this exists instead of the global keyboard. fixed inset-0
          means it overlays the full viewport regardless of where it sits
          in the DOM, so nesting it here (rather than as a sibling of the
          root) doesn't affect anything. */}
      {hnModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onPointerDown={() => setHnModalOpen(false)}
        >
          <div
            className="bg-white rounded-[16px] w-full overflow-hidden shadow-2xl flex flex-col"
            style={{ maxWidth: "1200px", maxHeight: "90vh" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 shrink-0">
              <div className="w-5" />
              <p className="flex-1 text-center font-semibold text-[#0f172a] text-[16px]">
                Patient Hospital Number
              </p>
              <button
                type="button"
                onPointerDown={() => setHnModalOpen(false)}
                className="shrink-0 size-5 flex items-center justify-center active:opacity-60 text-[#2b2b2b] text-[18px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 shrink-0">
              <div className="bg-[#f4f6f9] h-[64px] rounded-[12px] border-2 border-[#3469b2] flex items-center px-5">
                <input
                  ref={hnModalInputRef}
                  value={hospitalNumber}
                  onChange={(e) =>
                    setHospitalNumber(e.target.value)
                  }
                  placeholder="e.g. 10003"
                  autoComplete="off"
                  className="w-full bg-transparent text-[28px] font-semibold text-[#0f172a] placeholder-[rgba(15,23,42,0.4)] focus:outline-none"
                />
              </div>
            </div>
            <KeyboardPad
              targetRef={hnModalInputRef}
              onDone={() => setHnModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
