import { useContext, useRef, useState } from "react";
import bedMapsPaths from "@/imports/02BedMaps-1/svg-20k9unw57a";
import type { Bed, BedStatus, DischargeType, Patient, Ward } from "../types";
import { BED_MAPS_STATUS, BED_MAPS_LEGEND } from "../constants";
import { bedDisplayNumber } from "../lib/beds";
import { awaitingBedPatients } from "../lib/patients";
import { timeAgo } from "../lib/time";
import { KbContext } from "../lib/kbContext";
import { Toast } from "../components/Toast";
import { BedMapsStatusIcon } from "../components/icons/BedMapsStatusIcon";

// ─── BED MAPS PAGE — from 02BedMaps-1 Figma design ──────────────────────────

export function BedMapsPage({
  beds,
  patients,
  wards,
  onAdmit,
  onAssignBed,
  onDischarge,
  onStatusChange,
  onTransfer,
}: {
  beds: Bed[];
  patients: Patient[];
  wards: Ward[];
  onAdmit: (
    hn: string,
    bedId: string,
  ) => { ok: boolean; error?: string };
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
  onStatusChange: (bedId: string, status: BedStatus) => void;
  onTransfer: (
    patientId: string,
    fromBedId: string,
    toBedId: string,
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedBed, setSelectedBed] = useState<Bed | null>(
    null,
  );
  const [transferMode, setTransferMode] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [admitHn, setAdmitHn] = useState("");
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const [wardDropOpen, setWardDropOpen] = useState(false);
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const { openFor } = useContext(KbContext);
  const searchRef = useRef<HTMLInputElement>(null);
  const admitRef = useRef<HTMLInputElement>(null);

  const showToast = (
    msg: string,
    type: "success" | "error",
  ) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const ql = search.toLowerCase();
  const filteredBeds = beds.filter((b) => {
    if (wardFilter && b.wardId !== wardFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (ql) {
      const p = b.patientId
        ? patients.find((pt) => pt.id === b.patientId)
        : null;
      if (
        !bedDisplayNumber(beds, b.id)
          .toLowerCase()
          .includes(ql) &&
        !(p && p.hospitalNumber.toLowerCase().includes(ql))
      )
        return false;
    }
    return true;
  });

  const modalPatient = selectedBed?.patientId
    ? patients.find((p) => p.id === selectedBed.patientId)
    : null;
  const modalWard = selectedBed
    ? wards.find((w) => w.id === selectedBed.wardId)
    : null;
  const availableForTransfer = beds.filter(
    (b) => b.status === "available" && b.id !== selectedBed?.id,
  );
  // Patients admitted to the selected bed's ward from Mediboards who still
  // have no bed — offered in the available-bed modal as a one-tap assign.
  const awaitingInWard = selectedBed
    ? awaitingBedPatients(patients).filter(
        (p) => p.wardId === selectedBed.wardId,
      )
    : [];

  const closeModal = () => {
    setSelectedBed(null);
    setTransferMode(false);
    setTransferTarget("");
    setAdmitHn("");
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onPointerDown={() => {
        setWardDropOpen(false);
        setStatusDropOpen(false);
      }}
    >
      {/* Toast */}
      {toast && (
        <div className="absolute top-2 left-3 right-3 z-30 pointer-events-none">
          <Toast msg={toast.msg} type={toast.type} />
        </div>
      )}

      {/* Header row — "Beds" title + legend (matches Frame20) */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-[10px]">
        <p className="font-semibold leading-[24px] text-[#0f172a] text-[16px] whitespace-nowrap">
          Beds
        </p>
        <div className="flex items-center gap-[20px] px-[8px]">
          {BED_MAPS_LEGEND.map((l) => (
            <div
              key={l.label}
              className="flex items-center gap-[10px]"
            >
              <div
                className="rounded-[4px] shrink-0"
                style={{
                  width: "20px",
                  height: "20px",
                  backgroundColor: l.color,
                }}
              />
              <p
                className="text-[#2b2b2b] text-[12px] font-semibold whitespace-nowrap"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {l.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main blue-tinted container (matches Container in Figma) */}
      <div
        className="flex-1 min-h-0 mx-5 mb-3 relative rounded-[14px] overflow-hidden flex flex-col"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
        }}
      >
        <div
          aria-hidden
          className="absolute border-[0.726px] border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[14px] z-10"
        />

        <div className="flex flex-col gap-[12px] px-[16.726px] pt-[12px] pb-[10.726px] flex-1 min-h-0">
          {/* Search + filter row (matches Container1 / Frame1) */}
          <div className="flex-shrink-0 flex items-center gap-[10px]">
            {/* Search input — flex-1 */}
            <div className="flex-1 min-w-0 h-[40px] bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] flex items-center px-[11px] gap-[10px]">
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={(e) => {
                  e.stopPropagation();
                  searchRef.current &&
                    openFor(searchRef.current);
                }}
                placeholder="Search bed, patient, MRN…"
                className="flex-1 min-w-0 bg-transparent text-[14px] text-[rgba(15,23,42,0.8)] placeholder-[rgba(15,23,42,0.5)] focus:outline-none font-normal"
              />
              <svg
                className="shrink-0"
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 16 16"
              >
                <path
                  d={bedMapsPaths.p107a080}
                  stroke="#64748B"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.33333"
                />
                <path
                  d="M14 14L11.1333 11.1333"
                  stroke="#64748B"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.33333"
                />
              </svg>
            </div>

            {/* Ward dropdown (matches Dropdown in Figma) */}
            <div
              className="relative shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                onPointerDown={() => {
                  setWardDropOpen((o) => !o);
                  setStatusDropOpen(false);
                }}
                className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] flex items-center justify-between px-[14px] gap-[8px] whitespace-nowrap"
                style={{ minWidth: "130px" }}
              >
                <p className="text-[14px] text-[rgba(15,23,42,0.5)] font-normal">
                  {wardFilter
                    ? (wards.find((w) => w.id === wardFilter)
                        ?.name ?? "All wards")
                    : "All wards"}
                </p>
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 16 16"
                  className="shrink-0"
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="#64748B"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.33333"
                  />
                </svg>
              </button>
              {wardDropOpen && (
                <div className="absolute top-[44px] left-0 z-20 bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] shadow-lg min-w-full overflow-hidden">
                  {[
                    { id: "", name: "All wards" },
                    ...wards,
                  ].map((w) => (
                    <button
                      key={w.id}
                      onPointerDown={() => {
                        setWardFilter(w.id);
                        setWardDropOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-[13px] font-medium whitespace-nowrap active:bg-[rgba(52,105,178,0.05)]"
                      style={{
                        color:
                          wardFilter === w.id
                            ? "#3469b2"
                            : "#0f172a",
                      }}
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status dropdown (matches Dropdown1 in Figma) */}
            <div
              className="relative shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                onPointerDown={() => {
                  setStatusDropOpen((o) => !o);
                  setWardDropOpen(false);
                }}
                className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] flex items-center justify-between px-[14px] gap-[8px] whitespace-nowrap"
                style={{ minWidth: "120px" }}
              >
                <p className="text-[14px] text-[rgba(15,23,42,0.5)] font-normal">
                  {statusFilter
                    ? (BED_MAPS_STATUS[
                        statusFilter as BedStatus
                      ]?.label ?? "All status")
                    : "All status"}
                </p>
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 16 16"
                  className="shrink-0"
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="#64748B"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.33333"
                  />
                </svg>
              </button>
              {statusDropOpen && (
                <div className="absolute top-[44px] right-0 z-20 bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] shadow-lg min-w-full overflow-hidden">
                  {[
                    { id: "", label: "All status" },
                    ...Object.entries(BED_MAPS_STATUS).map(
                      ([id, m]) => ({ id, label: m.label }),
                    ),
                  ].map((s) => (
                    <button
                      key={s.id}
                      onPointerDown={() => {
                        setStatusFilter(s.id);
                        setStatusDropOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-[13px] font-medium whitespace-nowrap active:bg-[rgba(52,105,178,0.05)]"
                      style={{
                        color:
                          statusFilter === s.id
                            ? "#3469b2"
                            : "#0f172a",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bed grid container — now white (was gray, holding a separate
              white card) for better contrast against the blue-tinted panel
              behind it, and the direct scroll area — down from three
              visible layers to two (blue-tinted outer, white inner). */}
          <div className="flex-1 min-h-0 bg-white rounded-[16px] overflow-hidden">
            {/* Scroll wrapper — unstyled, just establishes the scrollable
                area. Kept as a separate element from the centering wrapper
                below rather than combining overflow-y-auto with
                justify-center on one element: that combination has a real
                CSS gotcha where overflowing content's start can end up
                clipped/unreachable by scrolling. */}
            <div className="h-full overflow-y-auto pt-[20px] px-[16px] pb-[16px]">
              {/* Tiles start from the top rather than centering vertically —
                  tested live on the real kiosk in portrait; centering left a
                  large dead gap above the grid when there were few beds,
                  which read worse than just starting at the top. */}
              <div className="min-h-full flex flex-col justify-start">
                {/* auto-fit + minmax: columns are however many actually fit
                    the real container width, and every tile in every row
                    stretches evenly to fill it — fixes the fixed-width tiles
                    leaving a dead gap on the right in narrower/portrait
                    layouts, and adapts automatically without a separate
                    portrait/landscape code path. */}
                <div className="grid gap-[12px] content-start grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
                  {filteredBeds.map((b) => {
                    const meta = BED_MAPS_STATUS[b.status];
                    return (
                      <button
                        key={b.id}
                        onPointerDown={() => {
                          setSelectedBed(b);
                          setAdmitHn("");
                          setTransferMode(false);
                          setTransferTarget("");
                        }}
                        className="relative flex flex-col items-center justify-center rounded-[10px] active:scale-95 transition-transform"
                        style={{
                          height: "109px",
                          touchAction: "manipulation",
                        }}
                      >
                        {/* Icon wrapper is the badge's positioning anchor —
                            keeps the dot pinned to the icon's own corner
                            regardless of how wide the tile stretches, instead
                            of drifting out to the tile's outer edge. */}
                        <div className="relative shrink-0">
                          <BedMapsStatusIcon
                            status={b.status}
                            color={meta.color}
                          />
                          {b.status === "occupied" &&
                            b.patientId && (
                              <div
                                className="absolute top-[-4px] right-[-4px] size-[13px] rounded-full border-2 border-white"
                                style={{
                                  backgroundColor: meta.color,
                                }}
                              />
                            )}
                        </div>
                        <p
                          className="text-[13px] leading-[20px] font-semibold whitespace-nowrap truncate max-w-full"
                          style={{
                            color: meta.color,
                            fontFamily:
                              "'Plus Jakarta Sans', sans-serif",
                          }}
                        >
                          {bedDisplayNumber(beds, b.id)}
                        </p>
                      </button>
                    );
                  })}
                  {filteredBeds.length === 0 && (
                    <p
                      className="col-span-full text-center text-[13px] text-[#94a3b8] py-8"
                      style={{
                        fontFamily:
                          "'Plus Jakarta Sans', sans-serif",
                      }}
                    >
                      No beds match your filters
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Available bed: centered "Update Bed Info" modal (Figma design) ── */}
      {selectedBed?.status === "available" && !transferMode && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onPointerDown={closeModal}
        >
          <div
            className="bg-[#f7f7f7] rounded-[16px] w-full overflow-hidden shadow-2xl"
            style={{ maxWidth: "420px" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Title bar — bg-[#f7f7f7] rounded-tl rounded-tr */}
            <div className="flex items-center justify-between px-[10px] py-[8px] border-b border-[rgba(0,0,0,0.08)]">
              <div className="w-[20px]" />{" "}
              {/* spacer to center title */}
              <p
                className="flex-1 text-center font-semibold text-[#2b2b2b] text-[16px] leading-[26px]"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Update Bed Info
              </p>
              <button
                onPointerDown={closeModal}
                className="shrink-0 size-[20px] flex items-center justify-center active:opacity-60"
              >
                <svg
                  width="12.5"
                  height="12.5"
                  fill="none"
                  viewBox="0 0 12.5 12.5"
                >
                  <path
                    d="M11.875 0.625L0.625 11.875"
                    stroke="#2B2B2B"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                  <path
                    d="M11.875 11.875L0.625 0.625"
                    stroke="#2B2B2B"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-[8px] px-[8px] pb-[8px] pt-[4px]">
              {/* Bed info section — bed number + Available pill + ward */}
              <div className="px-[8px] py-[4px]">
                <div className="flex items-center justify-between">
                  <p
                    className="font-semibold text-[#282828] text-[16px] leading-[26px]"
                    style={{
                      fontFamily:
                        "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {bedDisplayNumber(beds, selectedBed.id)}
                  </p>
                  {/* "Available" pill — bg-[#ebebeb], border rgba(43,43,43,0.1), text 9px #2b2b2b */}
                  <div
                    className="flex flex-col items-start px-[7px] py-[3px] rounded-full border border-[rgba(43,43,43,0.1)]"
                    style={{ backgroundColor: "#ebebeb" }}
                  >
                    <p
                      className="font-semibold text-[#2b2b2b] text-[9px] leading-[13.5px] tracking-[0.225px] whitespace-nowrap"
                      style={{
                        fontFamily:
                          "'Plus Jakarta Sans', sans-serif",
                      }}
                    >
                      Available
                    </p>
                  </div>
                </div>
                <p
                  className="font-medium text-[#6c6c6c] text-[12px] leading-[20px]"
                  style={{
                    fontFamily:
                      "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {modalWard?.name ?? "—"}
                </p>
              </div>

              {/* Admit patient card — white, rounded-[12px] */}
              <div className="bg-white rounded-[12px] p-[16px] flex flex-col gap-[16px]">
                <p
                  className="font-semibold text-[#2b2b2b] text-[12px] leading-[26px]"
                  style={{
                    fontFamily:
                      "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  Admit patient
                </p>

                {/* Hospital number field */}
                <div className="flex flex-col gap-[8px]">
                  <p
                    className="font-semibold text-[#2b2b2b] text-[12px] leading-[16px] tracking-[0.3px]"
                    style={{
                      fontFamily:
                        "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    Hospital number
                  </p>
                  <div className="bg-[#f4f6f9] h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] flex items-center px-[12.726px]">
                    <input
                      ref={admitRef}
                      value={admitHn}
                      onChange={(e) =>
                        setAdmitHn(e.target.value)
                      }
                      onFocus={() =>
                        admitRef.current &&
                        openFor(admitRef.current, true)
                      }
                      placeholder="e.g 1002"
                      className="flex-1 min-w-0 bg-transparent text-[12px] text-[rgba(15,23,42,0.8)] placeholder-[rgba(15,23,42,0.5)] focus:outline-none font-normal"
                      style={{
                        fontFamily: "Inter, sans-serif",
                      }}
                    />
                    <svg
                      className="shrink-0"
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M4 6L8 10L12 6"
                        stroke="#64748B"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.33333"
                      />
                    </svg>
                  </div>
                </div>

                {/* Admit button — bg-[#00bd6d], rounded-[8px] */}
                <button
                  onPointerDown={() => {
                    if (!admitHn.trim()) {
                      showToast(
                        "Enter hospital number",
                        "error",
                      );
                      return;
                    }
                    const result = onAdmit(admitHn.trim(), selectedBed.id);
                    if (!result.ok) {
                      showToast(result.error ?? "Could not admit", "error");
                      return;
                    }
                    showToast(
                      `HN ${admitHn} admitted to ${bedDisplayNumber(beds, selectedBed.id)}`,
                      "success",
                    );
                    closeModal();
                  }}
                  className="w-full rounded-[8px] flex items-center justify-center py-[12px] active:opacity-80 border border-[#b4b4b4]"
                  style={{ backgroundColor: "#00bd6d" }}
                >
                  <span
                    className="font-semibold text-white text-[16px] leading-[26px] whitespace-nowrap"
                    style={{
                      fontFamily:
                        "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    Admit
                  </span>
                </button>
              </div>

              {/* Awaiting-bed card — complete an admission opened from
                  app-client by putting that patient in THIS bed */}
              {awaitingInWard.length > 0 && (
                <div className="bg-white rounded-[12px] p-[16px] flex flex-col gap-[10px]">
                  <p
                    className="font-semibold text-[#2b2b2b] text-[12px] leading-[26px]"
                    style={{
                      fontFamily:
                        "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    Assign to a waiting patient
                  </p>
                  <div className="flex flex-col gap-[6px] max-h-[180px] overflow-y-auto">
                    {awaitingInWard.map((p) => (
                      <button
                        key={p.id}
                        onPointerDown={() => {
                          const result = onAssignBed(p.id, selectedBed.id);
                          if (!result.ok) {
                            showToast(result.error ?? "Could not assign bed", "error");
                            return;
                          }
                          showToast(
                            `HN ${p.hospitalNumber} assigned to ${bedDisplayNumber(beds, selectedBed.id)} — admission complete`,
                            "success",
                          );
                          closeModal();
                        }}
                        className="flex items-center justify-between gap-[8px] px-[12px] py-[8px] rounded-[8px] border active:opacity-80 text-left"
                        style={{
                          backgroundColor: "#fffbeb",
                          borderColor: "#fcd34d",
                        }}
                      >
                        <span className="min-w-0">
                          <span
                            className="block font-semibold text-[#2b2b2b] text-[13px] leading-[18px] truncate"
                            style={{
                              fontFamily:
                                "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            HN {p.hospitalNumber}
                            {p.name ? ` · ${p.name}` : ""}
                          </span>
                          <span className="block text-[#b45309] text-[11px] leading-[16px]">
                            Awaiting bed · admitted {timeAgo(p.admittedAt)}
                          </span>
                        </span>
                        <span
                          className="shrink-0 font-semibold text-white text-[12px] px-[10px] py-[4px] rounded-[6px]"
                          style={{ backgroundColor: "#d97706" }}
                        >
                          Assign
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Set status card — white, rounded-[12px] */}
              <div className="bg-white rounded-[12px] px-[16px] py-[8px] flex flex-col gap-[16px]">
                <p
                  className="font-semibold text-[#2b2b2b] text-[12px] leading-[26px]"
                  style={{
                    fontFamily:
                      "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  Set status
                </p>
                {/* Status buttons — flex-wrap, gap-[6px], each ~143.5px wide */}
                <div className="flex flex-wrap gap-[6px]">
                  {[
                    {
                      label: "Maintenance",
                      status: "maintenance" as BedStatus,
                      bg: "#FE9A00",
                    },
                    {
                      label: "Reserved",
                      status: "reserved" as BedStatus,
                      bg: "#8464ba",
                    },
                    {
                      label: "Needs Cleaning",
                      status: "cleaning" as BedStatus,
                      bg: "#00a6f4",
                    },
                  ].map((btn) => (
                    <button
                      key={btn.status}
                      onPointerDown={() => {
                        onStatusChange(
                          selectedBed.id,
                          btn.status,
                        );
                        closeModal();
                      }}
                      className="flex-1 flex items-center justify-center px-[22px] py-[8px] rounded-[8px] active:opacity-80"
                      style={{
                        backgroundColor: btn.bg,
                        minWidth: "100px",
                      }}
                    >
                      <span
                        className="font-semibold text-white text-[12px] leading-[26px] whitespace-nowrap"
                        style={{
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {btn.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Non-available beds: centered modal (Figma 03) ── */}
      {selectedBed && selectedBed.status !== "available" && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onPointerDown={closeModal}
        >
          <div
            className="bg-[#f7f7f7] rounded-[16px] w-full overflow-hidden shadow-2xl"
            style={{ maxWidth: "420px" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Title bar */}
            <div className="flex items-center justify-between px-[10px] py-[8px] border-b border-[rgba(0,0,0,0.08)]">
              <div className="w-[20px]" />
              <p
                className="flex-1 text-center font-semibold text-[#2b2b2b] text-[16px] leading-[26px]"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Update Bed Info
              </p>
              <button
                onPointerDown={closeModal}
                className="shrink-0 size-[20px] flex items-center justify-center active:opacity-60"
              >
                <svg
                  width="12.5"
                  height="12.5"
                  fill="none"
                  viewBox="0 0 12.5 12.5"
                >
                  <path
                    d="M11.875 0.625L0.625 11.875"
                    stroke="#2B2B2B"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                  <path
                    d="M11.875 11.875L0.625 0.625"
                    stroke="#2B2B2B"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div
              className="p-[12px] flex flex-col gap-[8px] overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 140px)" }}
            >
              {/* Bed info card */}
              <div className="bg-white rounded-[12px] px-[16px] py-[14px] flex flex-col gap-[4px]">
                <div className="flex items-center justify-between">
                  <p
                    className="font-bold text-[#2b2b2b] text-[18px] leading-[26px]"
                    style={{
                      fontFamily:
                        "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {bedDisplayNumber(beds, selectedBed.id)}
                  </p>
                  {/* Status badge */}
                  <div
                    className="flex items-center gap-[4px] px-[10px] py-[3px] rounded-full border"
                    style={{
                      backgroundColor:
                        selectedBed.status === "occupied"
                          ? "#d0fae5"
                          : selectedBed.status === "maintenance"
                            ? "#fff3cd"
                            : selectedBed.status === "reserved"
                              ? "#ede9fb"
                              : "#f1f5f9",
                      borderColor:
                        selectedBed.status === "occupied"
                          ? "#a4f4cf"
                          : selectedBed.status === "maintenance"
                            ? "#ffd97a"
                            : selectedBed.status === "reserved"
                              ? "#c4b5f4"
                              : "#cbd5e1",
                    }}
                  >
                    <p
                      className="text-[12px] font-semibold leading-[18px]"
                      style={{
                        color:
                          selectedBed.status === "occupied"
                            ? "#00bd6d"
                            : selectedBed.status ===
                                "maintenance"
                              ? "#b45309"
                              : selectedBed.status ===
                                  "reserved"
                                ? "#6d28d9"
                                : "#64748b",
                      }}
                    >
                      {
                        BED_MAPS_STATUS[selectedBed.status]
                          .label
                      }
                    </p>
                  </div>
                </div>
                {/* Ward + MRN */}
                <p className="text-[13px] text-[#6b7280] leading-[20px]">
                  {modalWard?.name ?? "—"}
                  {modalPatient
                    ? ` • MRN ${modalPatient.hospitalNumber}`
                    : ""}
                </p>
                {/* Admitted time */}
                {modalPatient &&
                  (() => {
                    const h = Math.floor(
                      (Date.now() - modalPatient.admittedAt) /
                        3_600_000,
                    );
                    const label =
                      h < 1
                        ? "just now"
                        : h < 24
                          ? `${h} hour${h === 1 ? "" : "s"} ago`
                          : `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? "" : "s"} ago`;
                    return (
                      <p className="text-[13px] text-[#6b7280] leading-[20px]">
                        Admitted {label}
                      </p>
                    );
                  })()}
              </div>

              {/* Actions card */}
              <div className="bg-white rounded-[12px] px-[16px] py-[14px] flex flex-col gap-[14px]">
                {selectedBed.status === "occupied" &&
                modalPatient ? (
                  <>
                    {/* Set Status label */}
                    <p
                      className="font-semibold text-[#2b2b2b] text-[14px] leading-[20px]"
                      style={{
                        fontFamily:
                          "'Plus Jakarta Sans', sans-serif",
                      }}
                    >
                      Set Status
                    </p>

                    {/* Transfer to */}
                    <div className="flex flex-col gap-[8px]">
                      <p className="text-[13px] font-medium text-[#2b2b2b]">
                        Transfer to
                      </p>
                      <div className="relative">
                        <select
                          value={transferTarget}
                          onChange={(e) =>
                            setTransferTarget(e.target.value)
                          }
                          className="w-full appearance-none bg-white border border-[#e5e7eb] rounded-[10px] px-[14px] py-[11px] text-[13px] text-[#2b2b2b] pr-[36px] focus:outline-none"
                          style={{
                            fontFamily:
                              "'Plus Jakarta Sans', sans-serif",
                          }}
                        >
                          <option value="">
                            Choose target bed
                          </option>
                          {availableForTransfer.map((b) => {
                            const w = wards.find(
                              (w) => w.id === b.wardId,
                            );
                            return (
                              <option key={b.id} value={b.id}>
                                {bedDisplayNumber(beds, b.id)}
                                {w ? ` — ${w.name}` : ""}
                              </option>
                            );
                          })}
                        </select>
                        <div className="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2">
                          <svg
                            width="14"
                            height="14"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M6 9l6 6 6-6"
                              stroke="#6b7280"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Transfer Patient button */}
                      <button
                        onPointerDown={() => {
                          if (!transferTarget) {
                            showToast(
                              "Choose a target bed first",
                              "error",
                            );
                            return;
                          }
                          onTransfer(
                            modalPatient.id,
                            selectedBed.id,
                            transferTarget,
                          );
                          showToast(
                            `HN ${modalPatient.hospitalNumber} transferred`,
                            "success",
                          );
                          closeModal();
                        }}
                        className="w-full h-[48px] rounded-[10px] border border-[#b4b4b4] bg-white flex items-center justify-center gap-[8px] active:opacity-70"
                      >
                        <svg
                          width="18"
                          height="18"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M7 17L17 7M17 7H7M17 7v10"
                            stroke="#2b2b2b"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span
                          className="font-semibold text-[#2b2b2b] text-[15px]"
                          style={{
                            fontFamily:
                              "'Plus Jakarta Sans', sans-serif",
                          }}
                        >
                          Transfer Patient
                        </span>
                      </button>
                    </div>

                    {/* Discharge Patient button */}
                    <button
                      onPointerDown={() => {
                        onDischarge(
                          modalPatient.id,
                          selectedBed.id,
                          "discharged",
                        );
                        showToast(
                          `HN ${modalPatient.hospitalNumber} discharged`,
                          "success",
                        );
                        closeModal();
                      }}
                      className="w-full h-[48px] rounded-[10px] border flex items-center justify-center gap-[8px] active:opacity-70"
                      style={{
                        backgroundColor: "#fff1f2",
                        borderColor: "#ffccd3",
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                          stroke="#c70036"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span
                        className="font-semibold text-[#c70036] text-[15px]"
                        style={{
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        Discharge Patient
                      </span>
                    </button>

                    {/* Other Status */}
                    <div className="flex flex-col gap-[10px]">
                      <p
                        className="font-semibold text-[#2b2b2b] text-[14px] leading-[20px]"
                        style={{
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        Other Status
                      </p>
                      <div className="flex gap-[8px]">
                        <button
                          onPointerDown={() => {
                            onDischarge(
                              modalPatient.id,
                              selectedBed.id,
                              "lama",
                            );
                            showToast(
                              `HN ${modalPatient.hospitalNumber} — LAMA`,
                              "success",
                            );
                            closeModal();
                          }}
                          className="flex-1 h-[44px] rounded-[10px] flex items-center justify-center active:opacity-80"
                          style={{ backgroundColor: "#ff662f" }}
                        >
                          <span
                            className="font-semibold text-white text-[14px]"
                            style={{
                              fontFamily:
                                "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            LAMA
                          </span>
                        </button>
                        <button
                          onPointerDown={() => {
                            onDischarge(
                              modalPatient.id,
                              selectedBed.id,
                              "deceased",
                            );
                            showToast(
                              `HN ${modalPatient.hospitalNumber} — Deceased`,
                              "success",
                            );
                            closeModal();
                          }}
                          className="flex-1 h-[44px] rounded-[10px] flex items-center justify-center active:opacity-80"
                          style={{ backgroundColor: "#dd2237" }}
                        >
                          <span
                            className="font-semibold text-white text-[14px]"
                            style={{
                              fontFamily:
                                "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            Deceased
                          </span>
                        </button>
                        <button
                          onPointerDown={() => {
                            onDischarge(
                              modalPatient.id,
                              selectedBed.id,
                              "absconded",
                            );
                            showToast(
                              `HN ${modalPatient.hospitalNumber} — Absconded`,
                              "success",
                            );
                            closeModal();
                          }}
                          className="flex-1 h-[44px] rounded-[10px] flex items-center justify-center active:opacity-80"
                          style={{ backgroundColor: "#808790" }}
                        >
                          <span
                            className="font-semibold text-white text-[14px]"
                            style={{
                              fontFamily:
                                "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            Absconded
                          </span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Non-occupied: status change */
                  <>
                    <p
                      className="font-semibold text-[#2b2b2b] text-[14px] leading-[20px]"
                      style={{
                        fontFamily:
                          "'Plus Jakarta Sans', sans-serif",
                      }}
                    >
                      Set Status
                    </p>
                    <div className="flex flex-col gap-[8px]">
                      {(
                        [
                          "available",
                          "reserved",
                          "maintenance",
                          "cleaning",
                        ] as BedStatus[]
                      )
                        .filter((s) => s !== selectedBed.status)
                        .map((s) => {
                          const sm = BED_MAPS_STATUS[s];
                          return (
                            <button
                              key={s}
                              onPointerDown={() => {
                                onStatusChange(
                                  selectedBed.id,
                                  s,
                                );
                                closeModal();
                              }}
                              className="w-full flex items-center gap-[10px] px-[14px] py-[13px] rounded-[10px] border border-[rgba(0,0,0,0.08)] active:opacity-70"
                              style={{
                                backgroundColor: `${sm.color}14`,
                              }}
                            >
                              <div
                                className="size-[9px] rounded-full shrink-0"
                                style={{
                                  backgroundColor: sm.color,
                                }}
                              />
                              <span
                                className="text-[14px] font-semibold"
                                style={{ color: sm.color }}
                              >
                                Mark as {sm.label}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
