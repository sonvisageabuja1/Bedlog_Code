import { useContext, useEffect, useRef, useState } from "react";
import type { Bed, DischargeType, Patient, Ward } from "../types";
import { bedDisplayNumber } from "../lib/beds";
import { KbContext } from "../lib/kbContext";
import { stayHours, countdown } from "../lib/time";

// ─── ADMISSIONS PAGE ──────────────────────────────────────────────────────────

export function AdmissionsPage({
  patients,
  beds,
  wards,
  onDischarge,
}: {
  patients: Patient[];
  beds: Bed[];
  wards: Ward[];
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

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const ql = q.toLowerCase();
  const active = patients.filter(
    (p) =>
      p.status === "admitted" && p.hospitalNumber.includes(ql),
  );
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

      <div className="flex-1 overflow-y-auto p-3">
        {active.length === 0 && discharged.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
            <p className="text-sm font-medium">
              No patients found
            </p>
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
                    onDischarge(p.id, p.bedId, "discharged")
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
    </div>
  );
}
