import { useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { AppConfig, Bed, Patient } from "../types";
import { KbContext } from "../lib/kbContext";
import {
  fetchMediboardHospitals,
  fetchMediboardWardInfo,
  fetchMediboardWardSeed,
  fetchMediboardWards,
  mediboardDeviceStateToLocal,
  mediboardSetupWardToLocal,
  mediboardWardToLocal,
  registerMediboardDevice,
  type MediboardDepartment,
  type MediboardHospital,
  type MediboardWard,
  type MediboardWardInfo,
} from "../lib/mediboard";
import { MediboardsLogo } from "./icons/MediboardsLogo";

// ─── ONBOARDING FLOW ─────────────────────────────────────────────────────────
// Onboarding requires internet — it fetches the hospital + ward list from
// Mediboard so a device doesn't need everything typed in by hand. Day-to-day
// use of the device afterwards does not depend on connectivity.
//
// BedLog never creates or edits a ward, 2026-09-01 — every ward comes from
// Mediboard's own hospital account; onboarding only ever picks one from the
// list. Ward name/code/bed count/floor are read-only, straight from
// Mediboard, never locally editable.

export function OnboardingScreen({
  onComplete,
}: {
  // deviceId/deviceLabel are normally a device-level concern handled by the
  // caller (App) — generated locally, not something onboarding collects.
  // The one exception is `deviceOverride`: creating a brand-new ward goes
  // through Mediboard's `/setup` endpoint, which issues its own real
  // deviceId — that ID (not a locally-generated one) is what `/sync` needs
  // to work later, so onboarding has to hand it back when it has one.
  // `seed`, when present, is this ward's real bed/patient data fetched
  // from Mediboard — the caller should use it instead of generating fresh
  // all-available beds.
  onComplete: (
    config: Omit<AppConfig, "deviceId" | "deviceLabel">,
    seed?: { beds: Bed[]; patients: Patient[] },
    deviceOverride?: { deviceId: string; deviceLabel: string },
  ) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const { openFor } = useContext(KbContext);

  // ── Step 1: hospital search ──
  const [hospitals, setHospitals] = useState<MediboardHospital[]>(
    [],
  );
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [hospitalsError, setHospitalsError] = useState<
    string | null
  >(null);
  const [hospitalQuery, setHospitalQuery] = useState("");
  const [hospitalDropdownOpen, setHospitalDropdownOpen] =
    useState(false);
  const [selectedHospital, setSelectedHospital] =
    useState<MediboardHospital | null>(null);
  // Hospitals must come from Mediboard — no manual/offline entry. This
  // modal explains why and points admins at Sonvisage to get set up there
  // first, instead of offering a bypass.
  const [showMediboardSignupModal, setShowMediboardSignupModal] =
    useState(false);
  const hospitalSearchRef = useRef<HTMLInputElement>(null);

  const loadHospitals = () => {
    setHospitalsLoading(true);
    setHospitalsError(null);
    fetchMediboardHospitals()
      .then((list) => {
        setHospitals(list);
        setHospitalsLoading(false);
      })
      .catch((e: unknown) => {
        setHospitalsError(
          e instanceof Error ? e.message : "Failed to load hospitals",
        );
        setHospitalsLoading(false);
      });
  };
  useEffect(loadHospitals, []);

  const filteredHospitals = hospitals.filter((h) =>
    h.name.toLowerCase().includes(hospitalQuery.toLowerCase()),
  );

  // ── Step 2a: department (wards are created against a department — see
  // `department_name` on the create-ward payload — and some hospitals have
  // 20-30+ departments, so a flat ward list isn't browsable without this) ──
  const [selectedDepartment, setSelectedDepartment] =
    useState<MediboardDepartment | null>(null);
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [departmentDropdownOpen, setDepartmentDropdownOpen] =
    useState(false);
  const departments = selectedHospital?.departments ?? [];
  const filteredDepartments = departments.filter((d) =>
    d.name.toLowerCase().includes(departmentQuery.toLowerCase()),
  );

  // ── Step 2b: ward search (picked from Mediboard's own list only — BedLog
  // never creates a ward, so there's no editable draft to track here) ──
  const [wards, setWards] = useState<MediboardWard[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [wardsError, setWardsError] = useState<string | null>(
    null,
  );
  const [selectedWardId, setSelectedWardId] = useState<
    string | null
  >(null);
  const [wardQuery, setWardQuery] = useState("");
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [showAllWards, setShowAllWards] = useState(false);
  // ward.id -> department + device info, looked up one ward at a time via
  // the per-ward /device endpoint (the plain ward list has neither).
  // Missing/undefined entries (still loading, or lookup failed) are
  // treated as "unknown department" and shown rather than hidden.
  const [wardInfo, setWardInfo] = useState<
    Record<string, MediboardWardInfo | null>
  >({});
  // Real bed/patient data for whichever fetched ward is selected — used to
  // inherit actual occupancy instead of resetting everyone to "available".
  const [wardSeed, setWardSeed] = useState<{
    beds: Bed[];
    patients: Patient[];
  } | null>(null);
  const [wardSeedLoading, setWardSeedLoading] = useState(false);
  const [wardSeedError, setWardSeedError] = useState<
    string | null
  >(null);
  // Set when the picked existing ward already has a real Mediboard
  // deviceId (from a prior /setup) — inheriting it lets this device
  // /sync immediately instead of getting a locally-generated id Mediboard
  // has never heard of. Null means this ward has never had a device.
  const [inheritedDevice, setInheritedDevice] = useState<{
    deviceId: string;
    deviceLabel: string;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>(
    {},
  );
  // Registering a device for a ward that has no `deviceId` yet, on finish.
  const [creatingWardBusy, setCreatingWardBusy] = useState(false);
  const [createWardError, setCreateWardError] = useState<
    string | null
  >(null);

  const loadWards = (hospitalId: string) => {
    setWardsLoading(true);
    setWardsError(null);
    setSelectedWardId(null);
    setWardInfo({});
    fetchMediboardWards(hospitalId)
      .then((list) => {
        setWards(list);
        setWardsLoading(false);
        // Department + device lookups happen in the background, one call
        // per ward — the picker doesn't wait on these, it just narrows
        // (and gains device-inheritance info) as they land.
        Promise.all(
          list.map((w) =>
            fetchMediboardWardInfo(hospitalId, w.id).then(
              (info) => [w.id, info] as const,
            ),
          ),
        ).then((pairs) => {
          setWardInfo(Object.fromEntries(pairs));
        });
      })
      .catch((e: unknown) => {
        setWardsError(
          e instanceof Error ? e.message : "Failed to load wards",
        );
        setWardsLoading(false);
      });
  };

  useEffect(() => {
    if (step === 2 && selectedHospital?.id) {
      setSelectedDepartment(null);
      setDepartmentQuery("");
      setShowAllWards(false);
      loadWards(selectedHospital.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedHospital?.id]);

  // Scoped using real per-ward department lookups (wardInfo), not the
  // name-matching guess this used to be. A ward with no known department
  // yet (still loading, or the lookup failed) stays visible rather than
  // being hidden by a filter we can't confirm.
  const departmentWards =
    selectedDepartment && !showAllWards
      ? wards.filter((w) => {
          const deptId = wardInfo[w.id]?.departmentId;
          return (
            deptId === undefined ||
            deptId === null ||
            deptId === selectedDepartment.id
          );
        })
      : wards;

  const pickDepartment = (d: MediboardDepartment) => {
    setSelectedDepartment(d);
    setDepartmentQuery(d.name);
    setDepartmentDropdownOpen(false);
    setShowAllWards(false);
    setSelectedWardId(null);
    setWardQuery("");
    setWardSeed(null);
    setWardSeedError(null);
    setInheritedDevice(null);
  };

  const pickWard = (w: MediboardWard) => {
    setSelectedWardId(w.id);
    setWardQuery(w.name);
    setWardDropdownOpen(false);
    setWardSeed(null);
    setWardSeedError(null);
    setCreateWardError(null);
    // Inherit this ward's real deviceId if one already exists (it went
    // through /setup before, on this or a prior install) — otherwise this
    // device has none yet, and one gets registered on Finish.
    const info = wardInfo[w.id];
    setInheritedDevice(
      info?.deviceId
        ? {
            deviceId: info.deviceId,
            deviceLabel: info.deviceLabel ?? `${w.name} - Bed Log`,
          }
        : null,
    );
    if (selectedHospital?.id) {
      setWardSeedLoading(true);
      fetchMediboardWardSeed(selectedHospital.id, w.id)
        .then((seed) => {
          setWardSeed(seed);
          setWardSeedLoading(false);
        })
        .catch((e: unknown) => {
          setWardSeedError(
            e instanceof Error
              ? e.message
              : "Failed to load bed details",
          );
          setWardSeedLoading(false);
        });
    }
  };

  const validateStep1 = () => {
    if (!selectedHospital) {
      setErrors({ hospital: "Select your hospital to continue" });
      return false;
    }
    setErrors({});
    return true;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!selectedDepartment)
      errs["department"] = "Select a department to continue";
    if (!selectedWardId)
      errs["ward"] = "Select a ward to continue";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Two paths, both against the same real, already-existing ward (BedLog
  // never creates one):
  //  - Already has a `deviceId` (from a prior `/setup`, this or another
  //    install) — nothing to register, just continue with the bed/patient
  //    data `pickWard` already fetched via `/device`.
  //  - No `deviceId` yet — register one now via `/setup`'s updated shape
  //    (2026-09-01: takes a real, existing `ward.id` instead of details for
  //    a new ward, and only ever registers a device — never creates
  //    anything). Confirmed live this only ever needs calling once per
  //    ward; a ward that already has a device always takes the branch
  //    above instead, so this can't re-issue or orphan an existing one.
  const handleFinish = async () => {
    if (!validateStep2()) return;
    const ward = wards.find((w) => w.id === selectedWardId);
    if (!ward || !selectedHospital?.id || !selectedDepartment) return;

    if (inheritedDevice) {
      onComplete(
        {
          hospitalName: selectedHospital.name,
          hospitalId: selectedHospital.id,
          wards: [mediboardWardToLocal(ward)],
        },
        wardSeed ?? undefined,
        inheritedDevice,
      );
      return;
    }

    setCreatingWardBusy(true);
    setCreateWardError(null);
    try {
      const device = await registerMediboardDevice(
        selectedHospital.id,
        {
          departmentName: selectedDepartment.name,
          ward: {
            id: ward.id,
            name: ward.name,
            code: ward.code,
            bedCount: ward.number_of_beds,
            floor: ward.ward_section,
          },
        },
      );
      setCreatingWardBusy(false);
      onComplete(
        {
          hospitalName: selectedHospital.name,
          hospitalId: selectedHospital.id,
          wards: [mediboardSetupWardToLocal(device)],
        },
        mediboardDeviceStateToLocal(
          device.ward.id,
          device.beds,
          device.patients,
        ),
        {
          deviceId: device.deviceId,
          deviceLabel: device.deviceLabel,
        },
      );
    } catch (e) {
      setCreatingWardBusy(false);
      setCreateWardError(
        e instanceof Error
          ? e.message
          : "Failed to set up this device on Mediboard",
      );
    }
  };

  const progress = step === 1 ? 50 : 100;

  return (
    <>
    <div
      className="fixed inset-0 z-[150] bg-white flex flex-col"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      onPointerDown={() => {
        setHospitalDropdownOpen(false);
        setDepartmentDropdownOpen(false);
        setWardDropdownOpen(false);
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-[#3469b2] px-5 pt-6 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <MediboardsLogo variant="light" />
        </div>
        <p className="text-white/70 text-[12px] font-semibold uppercase tracking-widest mb-1">
          Step {step} of 2
        </p>
        <p className="text-white font-bold text-[18px] leading-snug">
          {step === 1
            ? "Find your hospital"
            : "Select your department and ward"}
        </p>
        <p className="text-white/60 text-[12px] mt-1">
          {step === 1
            ? "Search Mediboard for the hospital this device belongs to"
            : "Pick the ward this device manages"}
        </p>
        {/* Progress bar */}
        <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {step === 1 && (
          <div className="space-y-3 pt-2">
            {/* Combo dropdown — type to filter, tap to scroll/pick */}
                <div
                  className="relative"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">
                    Hospital / Facility
                  </label>
                  <div className="relative">
                    <input
                      ref={hospitalSearchRef}
                      value={hospitalQuery}
                      onChange={(e) => {
                        setHospitalQuery(e.target.value);
                        setSelectedHospital(null);
                        setHospitalDropdownOpen(true);
                      }}
                      onFocus={() => {
                        hospitalSearchRef.current &&
                          openFor(hospitalSearchRef.current);
                        setHospitalDropdownOpen(true);
                      }}
                      placeholder={
                        hospitalsLoading
                          ? "Loading hospitals…"
                          : "Search or tap to browse hospitals…"
                      }
                      autoComplete="off"
                      disabled={
                        hospitalsLoading || !!hospitalsError
                      }
                      className="w-full h-12 bg-[#f4f6f9] rounded-[12px] border-2 px-4 pr-11 text-[15px] font-semibold text-[#0f172a] placeholder-[rgba(15,23,42,0.35)] focus:outline-none transition-colors disabled:opacity-50"
                      style={{
                        borderColor: errors.hospital
                          ? "#dd2237"
                          : selectedHospital
                            ? "#3469b2"
                            : "transparent",
                      }}
                    />
                    {/* Clear (when there's text/selection) or chevron toggle */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (selectedHospital || hospitalQuery) {
                          setSelectedHospital(null);
                          setHospitalQuery("");
                          setHospitalDropdownOpen(true);
                          hospitalSearchRef.current?.focus();
                        } else {
                          setHospitalDropdownOpen((o) => !o);
                        }
                      }}
                      disabled={
                        hospitalsLoading || !!hospitalsError
                      }
                      className="absolute right-0 top-0 h-12 w-11 flex items-center justify-center text-[#64748b] disabled:opacity-40"
                    >
                      {selectedHospital || hospitalQuery ? (
                        <svg
                          width="14"
                          height="14"
                          fill="none"
                          viewBox="0 0 14 14"
                        >
                          <path
                            d="M13 1L1 13M1 1l12 12"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          fill="none"
                          viewBox="0 0 16 16"
                        >
                          <path
                            d="M4 6L8 10L12 6"
                            stroke="currentColor"
                            strokeWidth="1.33333"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Dropdown panel */}
                    {hospitalDropdownOpen &&
                      !hospitalsLoading &&
                      !hospitalsError && (
                        <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-20 bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] shadow-lg max-h-64 overflow-y-auto">
                          {filteredHospitals.length === 0 ? (
                            <p className="text-center text-[13px] text-[#94a3b8] py-6 px-3">
                              No hospitals match "
                              {hospitalQuery}"
                            </p>
                          ) : (
                            filteredHospitals.map((h) => (
                              <button
                                key={h.id}
                                onClick={() => {
                                  setSelectedHospital(h);
                                  setHospitalQuery(h.name);
                                  setHospitalDropdownOpen(false);
                                  setErrors({});
                                }}
                                className="w-full text-left px-4 py-3 text-[14px] font-medium whitespace-nowrap active:bg-[rgba(52,105,178,0.05)] border-b border-[rgba(0,0,0,0.05)] last:border-b-0"
                                style={{
                                  color:
                                    selectedHospital?.id === h.id
                                      ? "#3469b2"
                                      : "#0f172a",
                                }}
                              >
                                {h.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                  </div>
                  {errors.hospital && (
                    <p className="text-[#dd2237] text-xs mt-1.5 font-medium">
                      {errors.hospital}
                    </p>
                  )}
                </div>

                {hospitalsError && (
                  <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={14}
                        className="text-[#dd2237] mt-0.5 shrink-0"
                      />
                      <p className="text-[11px] text-[#dd2237] leading-relaxed">
                        {hospitalsError}
                      </p>
                    </div>
                    <button
                      onClick={loadHospitals}
                      className="text-[12px] font-semibold text-[#3469b2] text-left"
                    >
                      Try again
                    </button>
                    <button
                      onClick={() =>
                        setShowMediboardSignupModal(true)
                      }
                      className="text-[12px] font-semibold text-[#64748b] text-left"
                    >
                      Can't find your hospital?
                    </button>
                  </div>
                )}

                {!hospitalsLoading && !hospitalsError && (
                  <button
                    onClick={() =>
                      setShowMediboardSignupModal(true)
                    }
                    className="w-full text-center text-[12px] font-semibold text-[#64748b] pt-1"
                  >
                    Can't find your hospital?
                  </button>
                )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 pt-2">
            {
              <div
                className="relative"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">
                  Department
                </label>
                <div className="relative">
                  <input
                    value={departmentQuery}
                    onChange={(e) => {
                      setDepartmentQuery(e.target.value);
                      setSelectedDepartment(null);
                      setDepartmentDropdownOpen(true);
                    }}
                    onFocus={(e) => {
                      openFor(e.currentTarget);
                      setDepartmentDropdownOpen(true);
                    }}
                    placeholder="Search or tap to browse departments…"
                    autoComplete="off"
                    className="w-full h-12 bg-[#f4f6f9] rounded-[12px] border-2 px-4 pr-11 text-[15px] font-semibold text-[#0f172a] placeholder-[rgba(15,23,42,0.35)] focus:outline-none transition-colors"
                    style={{
                      borderColor: errors.department
                        ? "#dd2237"
                        : selectedDepartment
                          ? "#3469b2"
                          : "transparent",
                    }}
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (selectedDepartment || departmentQuery) {
                        setSelectedDepartment(null);
                        setDepartmentQuery("");
                        setDepartmentDropdownOpen(true);
                      } else {
                        setDepartmentDropdownOpen((o) => !o);
                      }
                    }}
                    className="absolute right-0 top-0 h-12 w-11 flex items-center justify-center text-[#64748b]"
                  >
                    {selectedDepartment || departmentQuery ? (
                      <svg
                        width="14"
                        height="14"
                        fill="none"
                        viewBox="0 0 14 14"
                      >
                        <path
                          d="M13 1L1 13M1 1l12 12"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        fill="none"
                        viewBox="0 0 16 16"
                      >
                        <path
                          d="M4 6L8 10L12 6"
                          stroke="currentColor"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>

                  {departmentDropdownOpen && (
                    <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-20 bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] shadow-lg max-h-64 overflow-y-auto">
                      {filteredDepartments.length === 0 ? (
                        <p className="text-center text-[13px] text-[#94a3b8] py-6 px-3">
                          No departments match "
                          {departmentQuery}"
                        </p>
                      ) : (
                        filteredDepartments.map((d) => (
                          <button
                            key={d.id}
                            onClick={() => pickDepartment(d)}
                            className="w-full text-left px-4 py-3 text-[14px] font-medium whitespace-nowrap active:bg-[rgba(52,105,178,0.05)] border-b border-[rgba(0,0,0,0.05)] last:border-b-0"
                            style={{
                              color:
                                selectedDepartment?.id === d.id
                                  ? "#3469b2"
                                  : "#0f172a",
                            }}
                          >
                            {d.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {errors.department && (
                  <p className="text-[#dd2237] text-xs mt-1.5 font-medium">
                    {errors.department}
                  </p>
                )}
              </div>
            }

            {selectedDepartment && (
              <>
                {wardsLoading && (
                      <p className="text-center text-[13px] text-[#64748b] py-6">
                        Loading wards…
                      </p>
                    )}

                    {wardsError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-3">
                        <AlertTriangle
                          size={14}
                          className="text-[#dd2237] mt-0.5 shrink-0"
                        />
                        <p className="text-[11px] text-[#dd2237] leading-relaxed">
                          {wardsError} — check your connection and
                          try again.
                        </p>
                      </div>
                    )}

                    {!wardsLoading && !wardsError && (
                      <div
                        className="relative"
                        onPointerDown={(e) =>
                          e.stopPropagation()
                        }
                      >
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider">
                            {showAllWards
                              ? `All wards at ${selectedHospital?.name ?? "this hospital"}`
                              : selectedDepartment
                                ? `Wards in "${selectedDepartment.name}"`
                                : `Existing wards at ${selectedHospital?.name ?? "this hospital"}`}
                          </label>
                          {selectedDepartment &&
                            wards.length !==
                              departmentWards.length && (
                              <button
                                onClick={() => {
                                  setShowAllWards((v) => !v);
                                  setWardQuery("");
                                }}
                                className="text-[10px] font-semibold text-[#3469b2] shrink-0"
                              >
                                {showAllWards
                                  ? "Filter by department"
                                  : "Show all wards instead"}
                              </button>
                            )}
                        </div>
                        <div className="relative">
                          <input
                            value={wardQuery}
                            onChange={(e) => {
                              setWardQuery(e.target.value);
                              setSelectedWardId(null);
                              setWardDropdownOpen(true);
                            }}
                            onFocus={(e) => {
                              openFor(e.currentTarget);
                              setWardDropdownOpen(true);
                            }}
                            placeholder="Search or tap to browse wards…"
                            autoComplete="off"
                            className="w-full h-12 bg-[#f4f6f9] rounded-[12px] border-2 px-4 pr-11 text-[15px] font-semibold text-[#0f172a] placeholder-[rgba(15,23,42,0.35)] focus:outline-none transition-colors"
                            style={{
                              borderColor: selectedWardId
                                ? "#3469b2"
                                : "transparent",
                            }}
                          />
                          <button
                            type="button"
                            onPointerDown={(e) =>
                              e.preventDefault()
                            }
                            onClick={() => {
                              if (selectedWardId || wardQuery) {
                                setSelectedWardId(null);
                                setWardQuery("");
                                setWardDropdownOpen(true);
                              } else {
                                setWardDropdownOpen((o) => !o);
                              }
                            }}
                            className="absolute right-0 top-0 h-12 w-11 flex items-center justify-center text-[#64748b]"
                          >
                            {selectedWardId || wardQuery ? (
                              <svg
                                width="14"
                                height="14"
                                fill="none"
                                viewBox="0 0 14 14"
                              >
                                <path
                                  d="M13 1L1 13M1 1l12 12"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            ) : (
                              <svg
                                width="16"
                                height="16"
                                fill="none"
                                viewBox="0 0 16 16"
                              >
                                <path
                                  d="M4 6L8 10L12 6"
                                  stroke="currentColor"
                                  strokeWidth="1.33333"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>

                          {wardDropdownOpen && (
                            <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-20 bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] shadow-lg max-h-64 overflow-y-auto">
                              {(() => {
                                const filtered =
                                  departmentWards.filter((w) =>
                                    w.name
                                      .toLowerCase()
                                      .includes(
                                        wardQuery.toLowerCase(),
                                      ),
                                  );
                                if (filtered.length === 0) {
                                  return (
                                    <p className="text-center text-[13px] text-[#94a3b8] py-6 px-3">
                                      No wards match "
                                      {wardQuery}"
                                    </p>
                                  );
                                }
                                return filtered.map((w) => (
                                  <button
                                    key={w.id}
                                    onClick={() => pickWard(w)}
                                    className="w-full text-left px-4 py-3 active:bg-[rgba(52,105,178,0.05)] border-b border-[rgba(0,0,0,0.05)] last:border-b-0"
                                    style={{
                                      color:
                                        selectedWardId === w.id
                                          ? "#3469b2"
                                          : "#0f172a",
                                    }}
                                  >
                                    <p className="text-[14px] font-semibold">
                                      {w.name}
                                    </p>
                                    <p className="text-[11px] text-[#64748b] mt-0.5">
                                      {w.code} ·{" "}
                                      {w.number_of_beds} beds
                                      {w.ward_section
                                        ? ` · ${w.ward_section}`
                                        : ""}
                                    </p>
                                  </button>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                {selectedWardId && (
              <div className="bg-[rgba(52,105,178,0.04)] border border-[rgba(52,105,178,0.12)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider">
                    Ward Details
                  </p>
                  {wards.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedWardId(null);
                        setWardQuery("");
                        setWardSeed(null);
                        setWardSeedError(null);
                        setInheritedDevice(null);
                        setCreateWardError(null);
                      }}
                      className="text-[11px] font-semibold text-[#64748b]"
                    >
                      Change
                    </button>
                  )}
                </div>

                {/* Real bed/patient data status for a picked (not newly-created) ward */}
                {selectedWardId && (
                  <div className="mb-3">
                    {wardSeedLoading && (
                      <p className="text-[11px] text-[#64748b]">
                        Loading bed details…
                      </p>
                    )}
                    {wardSeedError && (
                      <p className="text-[11px] text-[#dd2237]">
                        Couldn't load bed details ({wardSeedError})
                        — this device will start with all beds
                        available instead.
                      </p>
                    )}
                    {wardSeed && !wardSeedLoading && (
                      <p className="text-[11px] text-[#156f48] font-medium">
                        ✓ Inherited {wardSeed.patients.length}{" "}
                        occupied ·{" "}
                        {wardSeed.beds.length -
                          wardSeed.patients.length}{" "}
                        available from Mediboard
                      </p>
                    )}
                    {inheritedDevice ? (
                      <p className="text-[11px] text-[#156f48] font-medium mt-1">
                        ✓ Linked to this ward's existing Mediboard
                        device — sync will work right away.
                      </p>
                    ) : (
                      wardInfo[selectedWardId] !== undefined && (
                        <p className="text-[11px] text-[#ff662f] font-medium mt-1">
                          This ward hasn't been linked to a
                          Mediboard device yet — one will be
                          registered automatically when you finish.
                        </p>
                      )
                    )}
                  </div>
                )}

                {/* Ward fields are read-only — every ward comes straight
                    from Mediboard, BedLog never creates or edits one. */}
                {(() => {
                  const ward = wards.find(
                    (w) => w.id === selectedWardId,
                  );
                  if (!ward) return null;
                  return (
                    <>
                      <div className="mb-3">
                        <label className="block text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                          Ward Name
                        </label>
                        <div className="w-full h-10 bg-[#f4f6f9] rounded-[10px] border-2 border-[#e2e8f0] px-3 flex items-center text-[14px] font-semibold text-[#0f172a] opacity-50 cursor-not-allowed">
                          {ward.name}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-24">
                          <label className="block text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                            Floor
                          </label>
                          <div className="w-full h-10 bg-[#f4f6f9] rounded-[10px] border-2 border-[#e2e8f0] px-3 flex items-center text-[14px] font-semibold text-[#0f172a] opacity-50 cursor-not-allowed">
                            {ward.ward_section || "—"}
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                            Number of Beds
                          </label>
                          <div className="w-full h-10 bg-[#f4f6f9] rounded-[10px] border-2 border-[#e2e8f0] px-3 flex items-center text-[14px] font-semibold text-[#0f172a] opacity-50 cursor-not-allowed">
                            {ward.number_of_beds}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="flex-shrink-0 px-5 py-4 bg-white border-t border-black/10 space-y-2">
        {step === 1 ? (
          <button
            onClick={() => validateStep1() && setStep(2)}
            className="w-full h-12 rounded-[12px] text-white text-[15px] font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: "#3469b2" }}
          >
            Continue
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <>
            {createWardError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-1">
                <AlertTriangle
                  size={14}
                  className="text-[#dd2237] mt-0.5 shrink-0"
                />
                <p className="text-[11px] text-[#dd2237] leading-relaxed">
                  Couldn't set up this device on Mediboard (
                  {createWardError}). Nothing was saved — check your
                  connection and try again.
                </p>
              </div>
            )}
            <button
              onClick={handleFinish}
              disabled={!selectedWardId || creatingWardBusy}
              className="w-full h-12 rounded-[12px] text-white text-[15px] font-bold active:scale-[0.98] transition-all disabled:opacity-40"
              style={{ backgroundColor: "#156f48" }}
            >
              {creatingWardBusy
                ? "Setting up on Mediboard…"
                : inheritedDevice
                  ? "Continue →"
                  : "Finish Setup →"}
            </button>
            <button
              onClick={() => setStep(1)}
              disabled={creatingWardBusy}
              className="w-full h-10 rounded-[12px] text-[#64748b] text-[13px] font-semibold active:opacity-70 disabled:opacity-40"
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
    {showMediboardSignupModal && (
      <div
        className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-5"
        onPointerDown={() => setShowMediboardSignupModal(false)}
      >
        <div
          className="bg-white rounded-2xl p-5 max-w-sm w-full"
          style={{ fontFamily: "Inter, system-ui, sans-serif" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-[15px] font-bold text-[#0f172a] mb-2">
            Hospital not listed
          </p>
          <p className="text-[13px] text-[#334155] leading-relaxed">
            Contact Sonvisage for Mediboard Account Setup to
            proceed.
          </p>
          <p className="text-[13px] text-[#334155] leading-relaxed mt-2">
            For further info contact us at:{" "}
            <a
              href="mailto:contact@sonvisage.com"
              className="font-semibold text-[#3469b2]"
            >
              contact@sonvisage.com
            </a>
          </p>
          <button
            onClick={() => setShowMediboardSignupModal(false)}
            className="w-full h-11 rounded-[12px] text-white text-[14px] font-bold mt-4 active:scale-[0.98] transition-all"
            style={{ backgroundColor: "#3469b2" }}
          >
            Got it
          </button>
        </div>
      </div>
    )}
    </>
  );
}
