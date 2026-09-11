import { useState } from "react";
import type { ActivityFilter, Bed, Patient } from "../types";
import { ACTIVITY_META } from "../constants";
import { StatCard } from "../components/StatCard";
import { ActivityRow } from "../components/ActivityRow";

// ─── REPORTS PAGE — strictly from 05ReportsPage Figma design ─────────────────

const ACTIVITY_FILTER_LABEL: Record<ActivityFilter, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
};
const ACTIVITY_FILTER_OPTIONS: ActivityFilter[] = [
  "today",
  "week",
  "month",
  "all",
];

export function ReportsPage({
  beds,
  patients,
  onBack,
  onAdmissionsHistory,
}: {
  beds: Bed[];
  patients: Patient[];
  onBack: () => void;
  onAdmissionsHistory: () => void;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("week");
  const [filterOpen, setFilterOpen] = useState(false);

  const now = new Date();
  const cutoffDate = new Date(now);
  if (filter === "today") {
    cutoffDate.setHours(0, 0, 0, 0);
  } else if (filter === "week") {
    cutoffDate.setDate(cutoffDate.getDate() - cutoffDate.getDay());
    cutoffDate.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    cutoffDate.setDate(1);
    cutoffDate.setHours(0, 0, 0, 0);
  } else {
    cutoffDate.setTime(0);
  }
  const cutoff = cutoffDate.getTime();

  const counts = {
    admitted: patients.filter((p) => p.admittedAt >= cutoff)
      .length,
    discharged: patients.filter(
      (p) =>
        p.dischargeType === "discharged" &&
        (p.dischargedAt ?? 0) >= cutoff,
    ).length,
    deceased: patients.filter(
      (p) =>
        p.dischargeType === "deceased" &&
        (p.dischargedAt ?? 0) >= cutoff,
    ).length,
    lama: patients.filter(
      (p) =>
        p.dischargeType === "lama" &&
        (p.dischargedAt ?? 0) >= cutoff,
    ).length,
    absconded: patients.filter(
      (p) =>
        p.dischargeType === "absconded" &&
        (p.dischargedAt ?? 0) >= cutoff,
    ).length,
    transferred: patients.filter(
      (p) =>
        p.dischargeType === "transferred" &&
        (p.dischargedAt ?? 0) >= cutoff,
    ).length,
  };

  const total = ACTIVITY_META.reduce(
    (s, m) => s + (counts[m.type as keyof typeof counts] ?? 0),
    0,
  );

  const totalBeds = beds.length;
  const occupiedBeds = beds.filter(
    (b) => b.status === "occupied",
  ).length;
  const availableBeds = beds.filter(
    (b) => b.status === "available",
  ).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header — Frame20: back button + title + history dropdown */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-[10px] border-b border-black/10 bg-white">
        {/* Left: back + title — Frame24 */}
        <div className="flex items-center gap-[12px]">
          {/* BackButton: bg-[#fbf9f9], p-[8px], rounded-[8px], border */}
          <button
            onClick={onBack}
            className="bg-[#fbf9f9] flex items-center justify-center p-[8px] rounded-[8px] shrink-0 active:opacity-70 relative"
            onPointerDown={(e) =>
              (e.currentTarget.style.opacity = "0.7")
            }
            onPointerUp={(e) =>
              (e.currentTarget.style.opacity = "1")
            }
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
            Occupancy Map &amp; Report
          </p>
        </div>

        {/* Right: Admissions History button — navigates to AdmissionsHistoryPage */}
        <button
          onClick={onAdmissionsHistory}
          className="bg-white flex items-center gap-[6px] p-[8px] rounded-[9px] relative active:opacity-70"
        >
          <div
            aria-hidden
            className="absolute border border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[9px]"
          />
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            className="shrink-0"
          >
            <path
              d="M12 8v4l3 3M3.05 11a9 9 0 1 0 .5-3"
              stroke="rgba(15,23,42,0.5)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="font-normal text-[14px] text-[rgba(15,23,42,0.5)] whitespace-nowrap leading-normal">
            Admissions History
          </p>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {/* StatsRow — 3 StatCards: Total, Occupied, Available */}
        <div className="flex gap-[16px] items-stretch">
          <StatCard
            iconBg="#EBF3FC"
            dotColor="#3469B2"
            label="Total Beds"
            value={totalBeds}
          />
          <StatCard
            iconBg="#FFF5EB"
            dotColor="#FF7F0B"
            label="Occupied Beds"
            value={occupiedBeds}
          />
          <StatCard
            iconBg="#EEF7EE"
            dotColor="#2E7D32"
            label="Available Beds"
            value={availableBeds}
          />
        </div>

        {/* RecentActivityCard */}
        <div className="bg-white relative rounded-[12px] p-[16px] flex flex-col gap-[12px]">
          <div
            aria-hidden
            className="absolute border border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[12px]"
          />

          {/* Card header — Frame26 */}
          <div className="flex items-center justify-between w-full">
            <p
              className="font-bold text-[#0f172a] text-[14px] whitespace-nowrap"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Recent Activity
            </p>
            <div className="flex items-center gap-[20px] text-[12px]">
              {/* Period filter — selectable: today / this week / this
                  month / all time. A backdrop behind the menu closes it
                  on any outside tap, no top-level handler needed. */}
              <div className="relative">
                <button
                  onClick={() => setFilterOpen((o) => !o)}
                  className="flex items-center gap-[4px] font-semibold text-[#0f172a] active:opacity-70"
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {ACTIVITY_FILTER_LABEL[filter]}
                  <svg
                    width="10"
                    height="10"
                    fill="none"
                    viewBox="0 0 10 10"
                  >
                    <path
                      d="M2 3.5L5 6.5L8 3.5"
                      stroke="#0f172a"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {filterOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setFilterOpen(false)}
                    />
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] shadow-lg overflow-hidden min-w-[130px]">
                      {ACTIVITY_FILTER_OPTIONS.map((f) => (
                        <button
                          key={f}
                          onClick={() => {
                            setFilter(f);
                            setFilterOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-[12px] font-medium whitespace-nowrap active:bg-[rgba(52,105,178,0.05)]"
                          style={{
                            color:
                              filter === f
                                ? "#3469b2"
                                : "#0f172a",
                            fontFamily:
                              "'Plus Jakarta Sans', sans-serif",
                          }}
                        >
                          {ACTIVITY_FILTER_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Total count */}
              <div
                className="flex items-center gap-[4px]"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                <span className="text-[#3469b2]">Total:</span>
                <span className="font-semibold text-[#3469b2]">
                  {total}
                </span>
              </div>
            </div>
          </div>

          {/* ActivityList */}
          <div className="flex flex-col gap-[8px]">
            {ACTIVITY_META.map((m) => (
              <ActivityRow
                key={m.type}
                label={m.label}
                pillBg={m.pillBg}
                pillColor={m.pillColor}
                count={
                  counts[m.type as keyof typeof counts] ?? 0
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
