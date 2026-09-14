import { useEffect, useState } from "react";
import { MediboardsLogo } from "./icons/MediboardsLogo";
import { GearIcon } from "./icons/GearIcon";
import { LiveClock } from "./LiveClock";

// ─── TOP BAR ─────────────────────────────────────────────────────────────────

export interface SyncIndicatorState {
  // Hidden entirely when there is nowhere to sync to.
  enabled: boolean;
  online: boolean;
  status: "idle" | "sending" | "success" | "error";
  lastSuccessfulAt: number | null;
  lastError?: string;
  // Local bed/patient changes newer than the last successful sync.
  hasUnsynced: boolean;
  // Expected pull cadence; online and idle for much longer than this means
  // the timer isn't running and is shown as "overdue" rather than "Synced".
  pullIntervalMs?: number;
}

function relative(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// Google-Docs style "saved / saving / offline" pill: network first, then
// sync state. Deliberately quiet — a dot, a word or two, a relative time.
export function SyncIndicator({ sync }: { sync: SyncIndicatorState }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!sync.enabled) return null;

  let dot = "#16a34a";
  let label: string;
  let pulse = false;
  let title: string | undefined;
  if (!sync.online) {
    dot = "#94a3b8";
    label = sync.hasUnsynced
      ? "Offline · changes saved on device"
      : "Offline";
    title = "Changes are kept on this device and sent when back online";
  } else if (sync.status === "sending") {
    dot = "#3469b2";
    label = "Syncing…";
    pulse = true;
  } else if (sync.status === "error" || (sync.hasUnsynced && sync.lastError)) {
    dot = "#dd2237";
    label = "Sync failed · will retry";
    title = sync.lastError;
  } else if (sync.hasUnsynced) {
    dot = "#f59e0b";
    label = "Unsynced changes";
  } else if (
    sync.lastSuccessfulAt &&
    sync.pullIntervalMs &&
    now - sync.lastSuccessfulAt > 2 * sync.pullIntervalMs
  ) {
    dot = "#f59e0b";
    label = `Sync overdue · last ${relative(sync.lastSuccessfulAt, now)}`;
    title = "Online but no sync has completed recently";
  } else if (sync.lastSuccessfulAt) {
    label = `Synced · ${relative(sync.lastSuccessfulAt, now)}`;
  } else {
    dot = "#94a3b8";
    label = "Not synced yet";
  }

  return (
    <div
      className="flex items-center gap-1.5 shrink-0 text-[12px] font-semibold text-[#64748b]"
      title={title}
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
            style={{ backgroundColor: dot }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: dot }}
        />
      </span>
      <span className="whitespace-nowrap">{label}</span>
      <span className="text-[#cbd5e1] px-1" aria-hidden="true">
        ·
      </span>
      <span
        className="whitespace-nowrap"
        style={{ color: sync.online ? "#16a34a" : "#94a3b8" }}
      >
        {sync.online ? "Online" : "No network"}
      </span>
    </div>
  );
}

export function TopBar({
  onSettingsPress,
  sync,
}: {
  onSettingsPress: () => void;
  sync: SyncIndicatorState;
}) {
  return (
    <div className="flex-shrink-0 bg-white flex gap-3 items-center px-5 py-[9px] border-b border-black/10">
      {/* Logo + status + date/time */}
      <div className="flex-1 flex items-center justify-between overflow-hidden">
        <MediboardsLogo />
        <div className="flex items-center gap-4 shrink-0">
          <SyncIndicator sync={sync} />
          <LiveClock />
        </div>
      </div>
      {/* Gear / settings */}
      <GearIcon onPress={onSettingsPress} />
    </div>
  );
}
