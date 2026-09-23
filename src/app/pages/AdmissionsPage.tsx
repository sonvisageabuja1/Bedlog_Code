import { useContext, useEffect, useRef, useState } from "react";
import type { Bed, DischargeType, Patient, Ward } from "../types";
import { bedDisplayNumber } from "../lib/beds";
import { awaitingBedPatients, isAwaitingBed } from "../lib/patients";
import { KbContext } from "../lib/kbContext";
import { stayHours, countdown, timeAgo } from "../lib/time";
import { Toast } from "../components/Toast";

// ─── ADMISSIONS PAGE ──────────────────────────────────────────────────────────

export function AdmissionsPage({
  patients,
  beds,
  wards,
  onAssignBed,
  onDischarge,
}: {
  patients: Patient[];
  beds: Bed[];
  wards: Ward[];
  // Completes an admission opened from app-client without a bed.
  onAssignBed: (
    patientId: string,
    bedId: string,
  ) => { ok: boolean; error?: string };
  onDischarge: (
    pid: string,
    bid: string,
    type: DischargeType,
  ) => void;
}) {
  const [q, setQ] = useState("");
  const { openFor } = useContext(KbContext);
  const searchRef = useRef<HTMLInputElement>(null);
  const [, setTick] = useState(0);
  // Patient whose bed is being picked in the "Assign bed" modal.
  const [assignFor, setAssignFor] = useState<Patient | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const ql = q.toLowerCase();
  const matches = (p: Patient) =>
    p.hospitalNumber.toLowerCase().includes(ql) ||
    (p.name ?? "").toLowerCase().includes(ql);
  // Admitted from app-client to this ward, bed not yet assigned. These are
  // real admissions, but they have no bed to discharge from here — the only
  // action is to assign one (outcomes for them are recorded on Mediboards).
  const awaiting = awaitingBedPatients(patients).filter(matches);
  const active = patients.filter(
    (p) => p.status === "admitted" && !isAwaitingBed(p) && matches(p),
  );
  const assignableBeds = assignFor
    ? beds.filter(
        (b) => b.wardId === assignFor.wardId && b.status === "available",
      )
    : [];
  const discharged = patients.filter(
    (p) =>
      p.status === "discharged" &&
      p.hospitalNumber.includes(ql),
  );

  const rowBg: Record<DischargeType, string> = {
    discharged: "#f0fdf4",
    deceased: "#fef2f2",
    lama: "#fff7ed",
    absconded: "#f8fafc",
    transferred: "#f5f3ff",
  };
  const rowLabel: Record<
    DischargeType,
    { text: string; color: string }
  > = {
    discharged: { text: "Discharged", color: "#156f48" },
    deceased: { text: "Deceased", color: "#dd2237" },
    lama: { text: "LAMA", color: "#ff662f" },
    absconded: { text: "Absconded", color: "#64748b" },
    transferred: { text: "Transferred", color: "#8b5cf6" },
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-3 pb-2 bg-white border-b border-black/10">
        <p className="font-semibold text-[#0f172a] text-[16px] leading-[24px] mb-2">
          Admissions
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() =>
              searchRef.current &&
              openFor(searchRef.current, true)
            }
            placeholder="Search hospital number..."
            className="flex-1 h-10 bg-[#f4f6f9] rounded-[10px] border border-black/10 px-3 text-sm font-bold text-[#0f172a] placeholder-[rgba(15,23,42,0.5)] focus:outline-none focus:ring-2 focus:ring-[#3469b2]"
          />
          <span className="text-[12px] text-[#64748b] font-semibold flex-shrink-0">
            {active.length} active
          </span>
        </div>
      </div>

      {toast && (
        <div className="pt-3">
          <Toast msg={toast.msg} type={toast.type} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {/* ── No-Bed Admissions — admitted to this ward from Mediboards, bed
            still to be assigned by a nurse here. Always shown, with an
            empty state, so the section is where nurses expect it. ── */}
        <p className="text-[10px] font-bold text-[#b45309] uppercase tracking-wider py-2 px-1">
          No-Bed Admissions ({awaiting.length})
          {awaiting.length > 0
            ? " — admitted from Mediboards, assign a bed to complete"
            : ""}
        </p>
        {awaiting.length === 0 && (
          <div
            className="border rounded-xl p-3 mb-2"
            style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
          >
            <p className="text-xs text-[#64748b]">
              {q
                ? "No patient awaiting a bed matches this search."
                : "No patients awaiting a bed. Patients admitted to this ward from Mediboards without a bed will appear here on the next sync."}
            </p>
          </div>
        )}
        {awaiting.length > 0 && (
          <>
            {awaiting.map((p) => {
              const ward = wards.find((w) => w.id === p.wardId);
              return (
                <div
                  key={p.id}
                  className="border rounded-xl p-3 mb-2 shadow-sm"
                  style={{
                    backgroundColor: "#fffbeb",
                    borderColor: "#fcd34d",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0f172a] truncate">
                        HN: {p.hospitalNumber}
                        {p.name ? (
                          <span className="font-medium text-[#64748b]">
                            {" "}
                            · {p.name}
                          </span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-[#64748b]">
                        <span
                          className="font-bold px-2 py-[2px] rounded-lg"
                          style={{
                            color: "#b45309",
                            backgroundColor: "#fef3c7",
                          }}
                        >
                          No bed yet
                        </span>
                        <span>🏥 {ward?.name ?? "N/A"}</span>
                        <span>⏱ admitted {timeAgo(p.admittedAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAssignFor(p)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-xl text-white text-xs font-semibold active:scale-95"
                      style={{ backgroundColor: "#d97706" }}
                    >
                      Assign bed
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── In a bed — the ward's own admissions ── */}
        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider py-2 px-1">
          In a bed ({active.length})
        </p>
        {active.length === 0 && discharged.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-[#64748b]">
            <p className="text-sm font-medium">No patients found</p>
          </div>
        )}
        {active.map((p) => {
          const bed = beds.find((b) => b.id === p.bedId);
          const ward = wards.find((w) => w.id === p.wardId);
          return (
            <div
              key={p.id}
              className="bg-white border border-black/10 rounded-xl p-3 mb-2 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-[#0f172a]">
                    HN: {p.hospitalNumber}
                  </p>
                  <div className="flex gap-3 mt-1 text-[10px] text-[#64748b]">
                    <span>
                      🛏{" "}
                      {bed
                        ? bedDisplayNumber(beds, bed.id)
                        : "N/A"}
                    </span>
                    <span>🏥 {ward?.name ?? "N/A"}</span>
                    <span>⏱ {stayHours(p.admittedAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() =>
                    // `active` excludes awaiting-bed patients, so bedId is set.
                    onDischarge(p.id, p.bedId!, "discharged")
                  }
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-white text-xs font-semibold active:scale-95"
                  style={{ backgroundColor: "#2138bc" }}
                >
                  Discharge
                </button>
              </div>
            </div>
          );
        })}
        {discharged.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider py-2 px-1">
              Recently discharged — auto-removing after 30 min
            </p>
            {discharged.map((p) => {
              const bed = beds.find((b) => b.id === p.bedId);
              const ward = wards.find((w) => w.id === p.wardId);
              const dt = p.dischargeType ?? "discharged";
              const label = rowLabel[dt];
              return (
                <div
                  key={p.id}
                  className="border border-black/10 rounded-xl p-3 mb-2 opacity-70"
                  style={{ backgroundColor: rowBg[dt] }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-[#0f172a]">
                        HN: {p.hospitalNumber}
                      </p>
                      <div className="flex gap-3 mt-1 text-[10px] text-[#64748b]">
                        <span>
                      🛏{" "}
                      {bed
                        ? bedDisplayNumber(beds, bed.id)
                        : "N/A"}
                    </span>
                        <span>🏥 {ward?.name ?? "N/A"}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded-lg"
                        style={{
                          color: label.color,
                          backgroundColor: label.color + "20",
                        }}
                      >
                        {label.text}
                      </span>
                      <p className="text-[10px] text-[#64748b] mt-1">
                        {countdown(p.dischargedAt!)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Assign bed modal — pick an available bed for an awaiting patient ── */}
      {assignFor && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onPointerDown={() => setAssignFor(null)}
        >
          <div
            className="bg-[#f7f7f7] rounded-[16px] w-full overflow-hidden shadow-2xl flex flex-col"
            style={{ maxWidth: "420px", maxHeight: "85vh" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-[10px] py-[8px] border-b border-[rgba(0,0,0,0.08)] shrink-0">
              <div className="w-[20px]" />
              <p
                className="flex-1 text-center font-semibold text-[#2b2b2b] text-[16px] leading-[26px]"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Assign bed
              </p>
              <button
                onPointerDown={() => setAssignFor(null)}
                className="shrink-0 size-[20px] flex items-center justify-center active:opacity-60 text-[#2b2b2b] text-[16px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-[16px] py-[10px] shrink-0">
              <p
                className="font-semibold text-[#282828] text-[16px] leading-[26px]"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                HN {assignFor.hospitalNumber}
                {assignFor.name ? ` · ${assignFor.name}` : ""}
              </p>
              <p
                className="font-medium text-[#6c6c6c] text-[12px] leading-[20px]"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Admitted from Mediboards {timeAgo(assignFor.admittedAt)}. Choose
                the bed the patient is in to complete the admission.
              </p>
            </div>
            <div className="bg-white rounded-[12px] mx-[8px] mb-[8px] p-[12px] overflow-y-auto min-h-0">
              {assignableBeds.length === 0 ? (
                <p className="text-[13px] text-[#8e8e93] text-center py-6">
                  No available beds in this ward
                </p>
              ) : (
                <div className="flex flex-wrap gap-[8px]">
                  {assignableBeds.map((b) => (
                    <button
                      key={b.id}
                      onPointerDown={() => {
                        const result = onAssignBed(assignFor.id, b.id);
                        if (!result.ok) {
                          showToast(result.error ?? "Could not assign bed", "error");
                          return;
                        }
                        showToast(
                          `HN ${assignFor.hospitalNumber} assigned to ${bedDisplayNumber(beds, b.id)} — admission complete`,
                          "success",
                        );
                        setAssignFor(null);
                      }}
                      className="min-w-[96px] flex-1 px-[12px] py-[10px] rounded-[8px] border border-[#6ee7b7] active:opacity-80"
                      style={{ backgroundColor: "#d1fae5" }}
                    >
                      <span
                        className="font-semibold text-[#059669] text-[13px] whitespace-nowrap"
                        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      >
                        {bedDisplayNumber(beds, b.id)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
