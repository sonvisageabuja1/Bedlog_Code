import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { AlertTriangle } from "lucide-react";

import type {
  BedStatus,
  Page,
  DischargeType,
  Bed,
  Patient,
  AppConfig,
} from "./types";
import { DISCHARGE_TTL } from "./constants";
import { ls } from "./lib/storage";
import { backupState } from "./lib/dbBackup";
import { uid } from "./lib/id";
import { isAwaitingBed } from "./lib/patients";
import { KbContext } from "./lib/kbContext";
import {
  getOrCreateDeviceId,
  loadStoredConfig,
  isConfigValid,
  buildSyncPayload,
  sendSyncPayload,
  syncBeds,
  setDeviceId,
  latestLocalChange,
  reconcileWithMediboard,
} from "./lib/sync";
import {
  buildMediboardSyncPayload,
  detachMediboardDevice,
  KNOWN_BED_STATUSES,
  syncMediboardWard,
} from "./lib/mediboard";
import { DashboardNavIcon } from "./components/icons/DashboardNavIcon";
import { BedMapsNavIcon } from "./components/icons/BedMapsNavIcon";
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import { TopBar } from "./components/TopBar";
import { PinModal } from "./components/PinModal";
import { SplashScreen } from "./components/SplashScreen";
import { NeedsSetupScreen } from "./components/NeedsSetupScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { DashboardPage } from "./pages/DashboardPage";
import { BedMapsPage } from "./pages/BedMapsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AdmissionsHistoryPage } from "./pages/AdmissionsHistoryPage";
import { SettingsPage } from "./pages/SettingsPage";

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    setTimeout(() => window.location.reload(), 5000);
  }
  render() {
    if (this.state.hasError)
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-white p-8 text-center">
          <AlertTriangle
            size={48}
            className="text-[#dd2237] mb-4"
          />
          <p className="text-lg font-bold text-[#0f172a] mb-2">
            Application Error
          </p>
          <p className="text-sm text-[#64748b] mb-4">
            Reloading in 5 seconds...
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-[10px] text-white font-semibold"
            style={{ backgroundColor: "#dd2237" }}
          >
            Reload Now
          </button>
        </div>
      );
    return this.props.children;
  }
}

// ─── APP ──────────────────────────────────────────────────────────────────────

// How often a linked device syncs with nothing to push, purely to pull the
// dashboard's bed list. A few requests an hour is nothing on a Pi.
const PULL_INTERVAL_MS = 5 * 60_000;

export default function App() {
  const [appState, setAppState] = useState<
    "splash" | "onboarding" | "needsSetup" | "ready"
  >("splash");
  const [page, setPage] = useState<Page>("dashboard");
  const [config, setConfig] = useState<AppConfig>(
    loadStoredConfig,
  );
  const [beds, setBeds] = useState<Bed[]>(() =>
    syncBeds(
      ls.get<Bed[]>("bl_beds", []),
      loadStoredConfig().wards,
    ),
  );
  const [patients, setPatients] = useState<Patient[]>(() =>
    ls.get("bl_patients", []),
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbNumeric, setKbNumeric] = useState(false);
  const activeElRef = useRef<HTMLInputElement | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [lastSync, setLastSync] = useState<{
    at: number;
    error?: string;
  } | null>(() =>
    ls.get<{ at: number; error?: string } | null>(
      "bl_last_sync",
      null,
    ),
  );
  // Distinct from `lastSync` (every attempt, success or fail) — this is
  // only ever updated when a sync actually succeeds, so the periodic
  // catch-up check below can tell whether a real-time attempt was missed
  // or failed, rather than just how long it's been since anything was
  // last tried.
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<
    number | null
  >(() => ls.get<number | null>("bl_last_successful_sync", null));

  // Whether this device counts as onboarded — checked against real config
  // content (a real `hospitalId` + at least one real ward), not just "was
  // something ever saved." See `isConfigValid` in lib/sync.ts for why this
  // matters: it's what keeps an interrupted/corrupted onboarding from ever
  // being mistaken for a completed one.
  const needsSetup = !isConfigValid(config);

  // Persist
  useEffect(() => {
    ls.set("bl_config", config);
  }, [config]);
  useEffect(() => {
    ls.set("bl_beds", beds);
  }, [beds]);
  useEffect(() => {
    ls.set("bl_patients", patients);
  }, [patients]);

  // Durable local backup — mirrors state into Postgres via db-backend/ on
  // every change, alongside (never instead of) the localStorage persist
  // above. Fire-and-forget; never affects app behavior if it fails.
  useEffect(() => {
    backupState(config, beds, patients);
  }, [config, beds, patients]);

  // Online status
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Auto-cleanup discharged patients after 30 min
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setPatients((prev) => {
        const next = prev.filter(
          (p) =>
            !(
              p.status === "discharged" &&
              p.dischargedAt &&
              now - p.dischargedAt >= DISCHARGE_TTL
            ),
        );
        return next.length !== prev.length ? next : prev;
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // Kiosk: disable right-click
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () =>
      document.removeEventListener("contextmenu", handler);
  }, []);

  // Keyboard
  const openFor = useCallback(
    (el: HTMLInputElement, numeric?: boolean) => {
      activeElRef.current = el;
      setKbOpen(true);
      setKbNumeric(!!numeric);
      setTimeout(
        () =>
          el.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          }),
        150,
      );
    },
    [],
  );
  const dismiss = useCallback(() => {
    setKbOpen(false);
    activeElRef.current = null;
  }, []);

  // Actions
  // Completes an admission that was opened from app-client without a bed:
  // the patient record gets the bed, the bed becomes occupied. Bumping the
  // bed's updatedAt is what makes the change-triggered sync push it, and
  // the server then completes its own open admission rather than opening a
  // second one. Works offline like every other ward action.
  const handleAssignBed = useCallback(
    (
      patientId: string,
      bedId: string,
    ): { ok: boolean; error?: string } => {
      const patient = patients.find((p) => p.id === patientId);
      if (!patient || !isAwaitingBed(patient)) {
        return { ok: false, error: "This patient is not awaiting a bed" };
      }
      const target = beds.find((b) => b.id === bedId);
      if (!target || target.status !== "available") {
        return { ok: false, error: "That bed is not available" };
      }
      const now = Date.now();
      setBeds((prev) => {
        const bed = prev.find((b) => b.id === bedId);
        if (!bed || bed.status !== "available") return prev;
        setPatients((ps) =>
          ps.map((p) =>
            p.id === patientId ? { ...p, bedId, wardId: bed.wardId } : p,
          ),
        );
        return prev.map((b) =>
          b.id === bedId
            ? { ...b, status: "occupied", patientId, updatedAt: now }
            : b,
        );
      });
      return { ok: true };
    },
    [beds, patients],
  );

  // One open admission per hospital number per ward — the same rule the
  // server enforces. Without it a second admit for the same patient pushes
  // as a "move" and the server and device disagree about which bed is real.
  // A patient AWAITING A BED with this hospital number is not a duplicate:
  // admitting them to a bed simply completes that admission.
  const handleAdmit = useCallback(
    (
      hospitalNumber: string,
      bedId: string,
    ): { ok: boolean; error?: string } => {
      const hn = hospitalNumber.trim();
      const already = patients.find(
        (p) =>
          p.status === "admitted" &&
          p.hospitalNumber.trim().toLowerCase() === hn.toLowerCase(),
      );
      if (already && isAwaitingBed(already)) {
        return handleAssignBed(already.id, bedId);
      }
      if (already) {
        const where = beds.find((b) => b.id === already.bedId);
        return {
          ok: false,
          error: `HN ${hn} is already admitted${where ? ` to ${where.number}` : ""} — discharge or transfer first`,
        };
      }
      const target = beds.find((b) => b.id === bedId);
      if (!target || target.status !== "available") {
        return { ok: false, error: "That bed is not available" };
      }
      setBeds((prev) => {
        const bed = prev.find((b) => b.id === bedId);
        if (!bed || bed.status !== "available") return prev;
        const pid = uid();
        setPatients((ps) => [
          ...ps,
          {
            id: pid,
            hospitalNumber,
            admittedAt: Date.now(),
            bedId,
            wardId: bed.wardId,
            status: "admitted",
          },
        ]);
        return prev.map((b) =>
          b.id === bedId
            ? {
                ...b,
                status: "occupied",
                patientId: pid,
                updatedAt: Date.now(),
              }
            : b,
        );
      });
      return { ok: true };
    },
    [beds, patients, handleAssignBed],
  );

  const handleDischarge = useCallback(
    (pid: string, bid: string, type: DischargeType) => {
      const now = Date.now();
      setPatients((prev) =>
        prev.map((p) =>
          p.id === pid
            ? {
                ...p,
                status: "discharged",
                dischargeType: type,
                dischargedAt: now,
              }
            : p,
        ),
      );
      setBeds((prev) =>
        prev.map((b) =>
          b.id === bid
            ? {
                ...b,
                status: "available",
                patientId: undefined,
                updatedAt: now,
              }
            : b,
        ),
      );
    },
    [],
  );

  const handleStatusChange = useCallback(
    (bid: string, status: BedStatus) => {
      setBeds((prev) =>
        prev.map((b) =>
          b.id === bid
            ? { ...b, status, updatedAt: Date.now() }
            : b,
        ),
      );
    },
    [],
  );

  const handleTransfer = useCallback(
    (patientId: string, fromBedId: string, toBedId: string) => {
      const now = Date.now();
      setBeds((prev) => {
        const toBed = prev.find((b) => b.id === toBedId);
        if (!toBed) return prev;
        setPatients((ps) =>
          ps.map((p) =>
            p.id === patientId
              ? { ...p, bedId: toBedId, wardId: toBed.wardId }
              : p,
          ),
        );
        return prev.map((b) => {
          if (b.id === fromBedId)
            return {
              ...b,
              status: "available" as BedStatus,
              patientId: undefined,
              updatedAt: now,
            };
          if (b.id === toBedId)
            return {
              ...b,
              status: "occupied" as BedStatus,
              patientId,
              updatedAt: now,
            };
          return b;
        });
      });
    },
    [],
  );

  const handleSaveConfig = useCallback((c: AppConfig) => {
    setConfig(c);
    setBeds((prev) => syncBeds(prev, c.wards));
  }, []);

  // Manual + automatic data sync. A Mediboard-linked device (has
  // hospitalId + a Mediboard-issued ward id) syncs straight to Mediboard's
  // own endpoint automatically — no URL to configure, since we already
  // know exactly where that is. A device not linked to Mediboard falls
  // back to the original generic behavior: POST to whatever URL the admin
  // configured in Settings > Data Sync.
  const triggerSync = useCallback(
    async (cfgOverride?: AppConfig) => {
      const cfg = cfgOverride ?? config;
      const ward = cfg.wards[0];
      setSyncStatus("sending");
      let error: string | undefined;
      try {
        if (cfg.hospitalId && ward?.id) {
          const payload = buildMediboardSyncPayload(
            cfg,
            beds,
            patients,
          );
          const device = await syncMediboardWard(
            cfg.hospitalId,
            ward.id,
            payload,
          );
          // Pull: Mediboard's reply carries the ward's real bed list and
          // open admissions, so beds added/removed and patients admitted on
          // the dashboard land here on every sync.
          if (device) {
            const merged = reconcileWithMediboard(
              beds,
              patients,
              ward.id,
              { beds: device.beds, patients: device.patients },
              KNOWN_BED_STATUSES,
            );
            if (merged.beds !== beds) setBeds(merged.beds);
            if (merged.patients !== patients) setPatients(merged.patients);
            const w = device.ward;
            if (
              w.name !== ward.name ||
              w.code !== ward.code ||
              w.capacity !== ward.capacity ||
              w.floor !== ward.floor
            ) {
              setConfig((c) => ({
                ...c,
                wards: c.wards.map((x) =>
                  x.id === ward.id
                    ? {
                        ...x,
                        name: w.name,
                        code: w.code,
                        capacity: w.capacity,
                        floor: w.floor,
                      }
                    : x,
                ),
              }));
            }
          }
        } else if (cfg.syncEndpoint) {
          const payload = buildSyncPayload(cfg, beds, patients);
          const result = await sendSyncPayload(
            cfg.syncEndpoint,
            payload,
          );
          if (!result.ok) error = result.error ?? "Sync failed";
        } else {
          error = "No endpoint set";
        }
      } catch (e) {
        error = e instanceof Error ? e.message : "Sync failed";
      }
      const record = { at: Date.now(), error };
      ls.set("bl_last_sync", record);
      setLastSync(record);
      if (!error) {
        ls.set("bl_last_successful_sync", record.at);
        setLastSuccessfulSyncAt(record.at);
      }
      setSyncStatus(error ? "error" : "success");
      setTimeout(() => setSyncStatus("idle"), 3000);
    },
    [config, beds, patients],
  );

  // Periodic catch-up sync: not tied to any specific time of day. Checks
  // every minute whether the most recent local bed/patient change is newer
  // than the last successful sync — if so, something didn't make it across
  // (the real-time sync below only fires while online, so this is what
  // catches up a device that was offline, or where a real-time attempt
  // failed) — and retries while online. A Mediboard-linked device always
  // runs this (offline-first rule: sync is opportunistic and automatic, no
  // switch to forget); only the generic-endpoint mode has a toggle.
  useEffect(() => {
    const linked = !!config.hospitalId;
    if (!linked && !(config.syncEnabled && config.syncEndpoint)) return;
    const check = () => {
      if (!online) return;
      const lastLocalChange = latestLocalChange(beds, patients);
      // Linked devices also sync on a timer even with nothing local to
      // push, because every sync doubles as a pull of the dashboard's bed
      // list (see triggerSync).
      const stale =
        !!config.hospitalId &&
        Date.now() - (lastSuccessfulSyncAt ?? 0) > PULL_INTERVAL_MS;
      if (lastLocalChange > (lastSuccessfulSyncAt ?? 0) || stale) {
        triggerSync();
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [
    config.syncEnabled,
    config.syncEndpoint,
    config.hospitalId,
    online,
    beds,
    patients,
    lastSuccessfulSyncAt,
    triggerSync,
  ]);

  // Real-time sync: fire automatically the moment a bed's status changes
  // (admit/discharge/transfer/status update) — not just from the manual
  // "Sync Now" button or the periodic catch-up above. Only while online and
  // once the device is actually in normal use (skips the very first run,
  // which is just initial load rather than a real change; skips onboarding
  // entirely). Silently does nothing if there's nowhere to sync to yet.
  const isFirstBedsSync = useRef(true);
  useEffect(() => {
    if (isFirstBedsSync.current) {
      isFirstBedsSync.current = false;
      return;
    }
    if (appState !== "ready" || !online) return;
    if (!config.hospitalId && !config.syncEndpoint) return;
    triggerSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beds, patients]);

  // Releases the ward on Mediboard, then wipes local setup so the device
  // is back to "Set up this device". Install id is kept on purpose so this
  // same Pi is recognised as "mine" if it's set up for the ward again.
  const handleDetach = useCallback(
    async (pin: string) => {
      const ward = config.wards[0];
      if (!config.hospitalId || !ward) {
        throw new Error("This device isn't linked to a Mediboard ward");
      }
      await detachMediboardDevice(config.hospitalId, ward.id, pin);
      for (const key of [
        "bl_beds",
        "bl_patients",
        "bl_cached_pin_hash",
        "bl_pin_changed",
      ]) {
        ls.remove(key);
      }
      const fresh: AppConfig = {
        hospitalName: "",
        wards: [],
        deviceId: getOrCreateDeviceId(),
      };
      ls.set("bl_config", fresh);
      setConfig(fresh);
      setBeds([]);
      setPatients([]);
      setPage("dashboard");
      setAppState("needsSetup");
    },
    [config],
  );

  const handleOnboardingComplete = useCallback(
    (
      c: Omit<AppConfig, "deviceId" | "deviceLabel">,
      seed?: { beds: Bed[]; patients: Patient[] },
      deviceOverride?: { deviceId: string; deviceLabel: string },
    ) => {
      // `deviceOverride` carries a real, Mediboard-issued deviceId back
      // from onboarding's `/setup` call — that has to become this
      // install's permanent deviceId (not just this session's), since
      // `/sync` only works for a deviceId Mediboard actually recognizes.
      if (deviceOverride) setDeviceId(deviceOverride.deviceId);
      const fullConfig: AppConfig = {
        ...config,
        ...c,
        // Linked devices sync on a timer by default — that timer is also
        // how dashboard-side bed changes reach the device.
        syncEnabled: c.hospitalId ? true : config.syncEnabled,
        deviceId: deviceOverride?.deviceId ?? getOrCreateDeviceId(),
        deviceLabel: deviceOverride?.deviceLabel,
      };
      // `seed` is real bed/patient data fetched from Mediboard for an
      // existing ward, handed over by onboarding — inherit it instead of
      // resetting everyone to "available" when it's available and valid.
      // No seed means the fetch failed — start empty rather than inventing
      // beds from capacity; the next sync pulls the real list.
      const initialBeds = seed?.beds ?? [];
      const initialPatients = seed?.patients ?? [];
      ls.set("bl_config", fullConfig);
      ls.set("bl_beds", initialBeds);
      ls.set("bl_patients", initialPatients);
      setConfig(fullConfig);
      setBeds(initialBeds);
      setPatients(initialPatients);
      setAppState("ready");
    },
    [],
  );

  return (
    <ErrorBoundary>
      <KbContext.Provider
        value={{
          isOpen: kbOpen,
          activeEl: activeElRef,
          numeric: kbNumeric,
          openFor,
          dismiss,
        }}
      >
        <div
          className="app-shell flex flex-col bg-white overflow-hidden"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
          onPointerDown={(e) => {
            if (
              kbOpen &&
              !(e.target as HTMLElement).closest(
                "input, select",
              )
            )
              dismiss();
          }}
        >
          {/* Splash screen */}
          {appState === "splash" && (
            <SplashScreen
              onDone={() =>
                setAppState(
                  needsSetup ? "needsSetup" : "ready",
                )
              }
            />
          )}

          {/* Not onboarded (or an onboarding attempt was interrupted) —
              the only thing this device can show until setup genuinely
              completes; no fallback dashboard to slip into by mistake. */}
          {appState === "needsSetup" && (
            <NeedsSetupScreen
              onStart={() => setAppState("onboarding")}
            />
          )}

          {/* Onboarding */}
          {appState === "onboarding" && (
            <>
              <OnboardingScreen
                onComplete={handleOnboardingComplete}
              />
              <VirtualKeyboard />
            </>
          )}

          {appState === "ready" && (
            <>
              <TopBar
                onSettingsPress={() => setShowPinModal(true)}
                sync={{
                  enabled: !!(config.hospitalId || config.syncEndpoint),
                  online,
                  status: syncStatus,
                  lastSuccessfulAt: lastSuccessfulSyncAt,
                  lastError: lastSync?.error,
                  pullIntervalMs: PULL_INTERVAL_MS,
                  hasUnsynced:
                    latestLocalChange(beds, patients) >
                    (lastSuccessfulSyncAt ?? 0),
                }}
              />

              <main
                className={`flex-1 min-h-0 ${page === "dashboard" ? "overflow-y-auto" : "overflow-hidden"}`}
                style={{
                  paddingBottom: kbOpen ? 340 : 0,
                  transition: "padding-bottom 0.2s ease",
                }}
              >
                {page === "dashboard" && (
                  <DashboardPage
                    beds={beds}
                    patients={patients}
                    wards={config.wards}
                    onAdmit={handleAdmit}
                    onAssignBed={handleAssignBed}
                    onDischarge={handleDischarge}
                    onNavigate={setPage}
                  />
                )}
                {page === "bedmaps" && (
                  <BedMapsPage
                    beds={beds}
                    patients={patients}
                    wards={config.wards}
                    onAdmit={handleAdmit}
                    onAssignBed={handleAssignBed}
                    onDischarge={handleDischarge}
                    onStatusChange={handleStatusChange}
                    onTransfer={handleTransfer}
                  />
                )}
                {page === "reports" && (
                  <ReportsPage
                    beds={beds}
                    patients={patients}
                    onBack={() => setPage("dashboard")}
                    onAdmissionsHistory={() =>
                      setPage("admissions-history")
                    }
                  />
                )}
                {page === "admissions-history" && (
                  <AdmissionsHistoryPage
                    patients={patients}
                    beds={beds}
                    wards={config.wards}
                    onBack={() => setPage("reports")}
                  />
                )}
                {page === "settings" && (
                  <SettingsPage
                    config={config}
                    onSave={handleSaveConfig}
                    beds={beds}
                    onBack={() => setPage("dashboard")}
                    onSyncNow={triggerSync}
                    syncStatus={syncStatus}
                    lastSync={lastSync}
                    onDetach={handleDetach}
                  />
                )}
              </main>

              {/* Bottom Navigation — Frame6: bg-[#fbf9f9], gap-[4px], px-[20px] py-[10px]. Two tabs: Dashboard, Bed Map */}
              <nav className="flex-shrink-0 bg-[#fbf9f9] flex gap-[4px] items-center px-[20px] py-[10px] border-t border-black/10">
                {/* Dashboard — ButtonMargin: flex-[1_0_0], h-[64px], bg-[#3469b2] when active */}
                <div className="flex-[1_0_0] flex flex-col items-center justify-center h-[64px]">
                  <button
                    onClick={() => setPage("dashboard")}
                    className="w-full h-full rounded-[10px] flex flex-row items-center justify-center gap-[24px] transition-colors active:opacity-90"
                    style={{
                      backgroundColor:
                        page === "dashboard"
                          ? "#3469b2"
                          : "rgba(52,105,178,0.05)",
                    }}
                  >
                    <DashboardNavIcon
                      color={
                        page === "dashboard"
                          ? "white"
                          : "#64748B"
                      }
                    />
                    <span
                      className="font-semibold leading-[20px] text-[20px] whitespace-nowrap"
                      style={{
                        color:
                          page === "dashboard"
                            ? "white"
                            : "#64748b",
                      }}
                    >
                      Dashboard
                    </span>
                  </button>
                </div>

                {/* Bed Map — ButtonMargin1: flex-[1_0_0], h-[60px], bg-[rgba(52,105,178,0.05)] when inactive */}
                <div className="flex-[1_0_0] flex flex-col items-center justify-center h-[60px]">
                  <button
                    onClick={() => setPage("bedmaps")}
                    className="w-full h-full rounded-[10px] flex flex-row items-center justify-center gap-[24px] transition-colors active:opacity-90"
                    style={{
                      backgroundColor:
                        page === "bedmaps"
                          ? "#3469b2"
                          : "rgba(52,105,178,0.05)",
                    }}
                  >
                    <BedMapsNavIcon
                      color={
                        page === "bedmaps" ? "white" : "#64748B"
                      }
                    />
                    <span
                      className="font-semibold leading-[20px] text-[20px] whitespace-nowrap"
                      style={{
                        color:
                          page === "bedmaps"
                            ? "white"
                            : "#64748b",
                      }}
                    >
                      Bed Map
                    </span>
                  </button>
                </div>
              </nav>

              {/* Virtual Keyboard */}
              <VirtualKeyboard />

              {/* Settings PIN Modal */}
              {showPinModal && (
                <PinModal
                  config={config}
                  onSuccess={() => {
                    setShowPinModal(false);
                    setPage("settings");
                  }}
                  onCancel={() => setShowPinModal(false)}
                />
              )}
            </>
          )}
        </div>
      </KbContext.Provider>
    </ErrorBoundary>
  );
}