import { useContext, useEffect, useState } from "react";
import { AlertTriangle, Eye, RefreshCw } from "lucide-react";
import type { AppConfig, Bed, Ward } from "../types";
import { KbContext } from "../lib/kbContext";
import { setMediboardPin } from "../lib/mediboard";
import { PinModal } from "../components/PinModal";
import {
  hashPin,
  setCachedPinHash,
  hasChangedPin,
  setHasChangedPin,
} from "../lib/pin";
import { WardModal } from "../components/WardModal";
import { NumericKeypad } from "../components/NumericKeypad";

export function SettingsPage({
  config,
  onSave,
  beds,
  onBack,
  onSyncNow,
  syncStatus,
  lastSync,
  onDetach,
}: {
  config: AppConfig;
  onSave: (c: AppConfig) => void;
  beds: Bed[];
  onBack: () => void;
  onSyncNow: (cfgOverride?: AppConfig) => void;
  syncStatus: "idle" | "sending" | "success" | "error";
  lastSync: { at: number; error?: string } | null;
  // Releases this ward on Mediboard (PIN already verified by the caller's
  // modal, forwarded here because the endpoint checks it again) and wipes
  // local setup so the device returns to "Set up this device".
  onDetach: (pin: string) => Promise<void>;
}) {
  const [detachPinOpen, setDetachPinOpen] = useState(false);
  const [detachBusy, setDetachBusy] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);
  const runDetach = async (pin: string) => {
    setDetachPinOpen(false);
    setDetachBusy(true);
    setDetachError(null);
    try {
      await onDetach(pin);
    } catch (e) {
      setDetachError(
        e instanceof Error ? e.message : "Couldn't detach this device",
      );
      setDetachBusy(false);
    }
  };
  const [draft, setDraft] = useState<AppConfig>(() =>
    JSON.parse(JSON.stringify(config)),
  );
  const [saved, setSaved] = useState(false);
  // Ward details are view-only — managed exclusively from Mediboard now.
  const [wardModal, setWardModal] = useState<Ward | null>(null);
  const { openFor } = useContext(KbContext);

  // Change PIN
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStatus, setPinStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [pinError, setPinError] = useState("");
  const [pinChanged, setPinChanged] = useState(() =>
    hasChangedPin(),
  );
  // Which PIN field (if any) is being edited via the numeric keypad modal —
  // see NumericKeypad.tsx for why this is a dedicated digits-only pad rather
  // than the shared alphanumeric keyboard.
  const [pinModalField, setPinModalField] = useState<
    "new" | "confirm" | null
  >(null);

  const handleChangePin = async () => {
    setPinError("");
    if (!/^\d{4}$/.test(newPin)) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs don't match");
      return;
    }
    setPinStatus("saving");
    try {
      const ward = draft.wards[0];
      if (draft.hospitalId && ward?.id) {
        if (!navigator.onLine) {
          throw new Error(
            "Requires an internet connection to update on Mediboard",
          );
        }
        await setMediboardPin(draft.hospitalId, ward.id, newPin);
      }
      setCachedPinHash(await hashPin(newPin));
      setHasChangedPin(true);
      setPinChanged(true);
      setNewPin("");
      setConfirmPin("");
      setPinStatus("success");
      setTimeout(() => setPinStatus("idle"), 2500);
    } catch (e) {
      setPinError(
        e instanceof Error ? e.message : "Failed to update PIN",
      );
      setPinStatus("error");
    }
  };

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(config)));
  }, [config]);

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const wardCode = (name: string) =>
    name.slice(0, 3).toUpperCase() || "—";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f7f7f7]">
      {/* Sub-header bar */}
      <div className="flex-shrink-0 bg-white border-b border-[rgba(0,0,0,0.08)] px-[20px] py-[10px] flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <button
            onPointerDown={onBack}
            className="bg-[#fbf9f9] border border-[rgba(0,0,0,0.1)] rounded-[8px] p-[8px] flex items-center justify-center active:opacity-70 shrink-0"
          >
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="#3469B2"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p
            className="font-semibold text-[#0f172a] text-[16px] leading-[24px]"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Settings
          </p>
        </div>
        <button
          onPointerDown={handleSave}
          className="px-[16px] h-[36px] rounded-[8px] flex items-center justify-center active:opacity-80 transition-all"
          style={{
            backgroundColor: saved ? "#156f48" : "#3469b2",
          }}
        >
          <span className="text-white text-[13px] font-semibold">
            {saved ? "✓ Saved" : "Save"}
          </span>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-[20px] py-[14px] flex flex-col gap-[14px]">
        {/* Department Name card */}
        <div
          className="rounded-[14px] border-[0.726px] border-[rgba(0,0,0,0.1)]"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
          }}
        >
          <div className="px-[10.726px] pt-[10.726px] pb-[12px] flex flex-col gap-[8px]">
            <p
              className="font-semibold text-[#2b2b2b] text-[11px] leading-[16.5px] tracking-[0.55px] uppercase"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Hospital Name
            </p>
            <div
              className={`h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] relative ${
                draft.hospitalId ? "bg-[#f4f6f9]" : "bg-white"
              }`}
            >
              <input
                value={draft.hospitalName}
                disabled={!!draft.hospitalId}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    hospitalName: e.target.value,
                  }))
                }
                onFocus={(e) => openFor(e.currentTarget)}
                className="absolute inset-0 w-full h-full px-[13px] bg-transparent font-bold text-[14px] text-[#0f172a] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: "Inter, sans-serif" }}
              />
            </div>
            {draft.hospitalId && (
              <p className="text-[10px] text-[#94a3b8]">
                Linked to Mediboard — rename from your hospital's
                Mediboard account.
              </p>
            )}
          </div>
        </div>

        {/* Wards & Bed Counts */}
        <div className="flex flex-col">
          {/* Section header — no "Add Ward" here: a bedlog device manages
              exactly one ward, set up during onboarding. This section only
              lets you edit that ward's details, never add another. */}
          <div className="flex items-center justify-between px-[10px] py-[10px]">
            <p
              className="font-semibold text-[#0f172a] text-[16px] leading-[24px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Ward &amp; Bed Count
            </p>
          </div>

          {/* Ward cards grid */}
          <div
            className="rounded-[14px] border-[0.726px] border-[rgba(0,0,0,0.1)] p-[10.726px]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
            }}
          >
            <div className="flex flex-wrap gap-[10px]">
              {draft.wards.map((w) => {
                const occupiedCount = beds.filter(
                  (b) =>
                    b.wardId === w.id &&
                    b.status === "occupied",
                ).length;
                const totalCount = beds.filter(
                  (b) => b.wardId === w.id,
                ).length;
                return (
                  <div
                    key={w.id}
                    className="bg-white rounded-[16px] flex flex-col gap-[8px] px-[14px] py-[8px]"
                    style={{ width: "calc(50% - 5px)" }}
                  >
                    <div className="flex items-center justify-between">
                      <p
                        className="font-semibold text-[#282828] text-[16px] leading-[26px]"
                        style={{
                          fontFamily:
                            "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {w.name}
                      </p>
                      <button
                        onPointerDown={() =>
                          setWardModal({ ...w })
                        }
                        className="bg-[#f2f2f7] rounded-[100px] size-[36px] flex items-center justify-center active:opacity-70 shrink-0"
                      >
                        <Eye size={16} color="#1C1C1E" />
                      </button>
                    </div>
                    <p
                      className="font-medium text-[#8e8e93] text-[13px]"
                      style={{
                        fontFamily: "Inter, sans-serif",
                      }}
                    >
                      {w.code || wardCode(w.name)} • Floor{" "}
                      {w.floor}
                    </p>
                    <p
                      className="text-[#909090] text-[12px] px-[8px] py-[4px]"
                      style={{
                        fontFamily:
                          "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 600,
                      }}
                    >
                      {occupiedCount}/{totalCount} Beds occupied
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Non-blocking warning — BedLog is deployed one device per ward */}
          {draft.wards.length > 1 && (
            <div className="mt-[10px] flex items-start gap-[8px] bg-amber-50 border border-amber-200 rounded-[12px] px-[12px] py-[10px]">
              <AlertTriangle
                size={14}
                className="text-amber-600 mt-0.5 shrink-0"
              />
              <p
                className="text-[11px] text-amber-800 leading-relaxed"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                This device is set up for multiple wards. If
                this device physically represents a single
                ward, syncing may report data for more than one
                ward.
              </p>
            </div>
          )}
        </div>

        {/* Device Identity */}
        <div className="flex flex-col">
          <div className="px-[10px] py-[10px]">
            <p
              className="font-semibold text-[#0f172a] text-[16px] leading-[24px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              This Device
            </p>
            <p
              className="text-[#8e8e93] text-[12px] mt-[2px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Identifies this device in every sync payload sent
              to your server.
            </p>
          </div>

          <div
            className="rounded-[14px] border-[0.726px] border-[rgba(0,0,0,0.1)] p-[12px] flex flex-col gap-[12px]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
            }}
          >
            {/* Device ID — read-only */}
            <div className="flex flex-col gap-[6px]">
              <p
                className="font-semibold text-[#2b2b2b] text-[11px] leading-[16.5px] tracking-[0.55px] uppercase"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Device ID
              </p>
              <div className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] flex items-center px-[13px]">
                <span
                  className="font-mono text-[12px] text-[#64748b] truncate"
                  title={draft.deviceId}
                >
                  {draft.deviceId}
                </span>
              </div>
            </div>

            {/* Device Label — editable */}
            <div className="flex flex-col gap-[6px]">
              <p
                className="font-semibold text-[#2b2b2b] text-[11px] leading-[16.5px] tracking-[0.55px] uppercase"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Device Label{" "}
                <span className="normal-case font-normal text-[#8e8e93]">
                  (optional)
                </span>
              </p>
              <div className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] relative">
                <input
                  value={draft.deviceLabel ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      deviceLabel: e.target.value,
                    }))
                  }
                  onFocus={(e) => openFor(e.currentTarget)}
                  placeholder="e.g. Ward 3 – Bed Station 1"
                  autoComplete="off"
                  className="absolute inset-0 w-full h-full px-[13px] bg-transparent font-medium text-[13px] text-[#0f172a] placeholder-[rgba(15,23,42,0.4)] focus:outline-none"
                  style={{ fontFamily: "Inter, sans-serif" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Ward Link — detach (Mediboard-linked devices only) */}
        {draft.hospitalId && draft.wards[0] && (
          <div className="flex flex-col">
            <div className="px-[10px] py-[10px]">
              <p
                className="font-semibold text-[#0f172a] text-[16px] leading-[24px]"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Ward Link
              </p>
              <p
                className="text-[#8e8e93] text-[12px] mt-[2px]"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                This device is the only one linked to{" "}
                {draft.wards[0].name}. Detach it to move the ward to
                another device or to set this one up again.
              </p>
            </div>
            <div className="bg-white rounded-[16px] border border-red-200 p-[16px] flex flex-col gap-[10px]">
              <p
                className="text-[12px] text-[#64748b] leading-relaxed"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Detaching stops this device from syncing and clears
                its local setup. Beds, patients, and history stay on
                Mediboard. Requires the ward PIN and an internet
                connection.
              </p>
              {detachError && (
                <p className="text-[11px] text-[#dd2237] font-medium">
                  {detachError}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setDetachError(null);
                  setDetachPinOpen(true);
                }}
                disabled={detachBusy}
                className="h-[44px] rounded-[10px] bg-white border border-[#dd2237] text-[#dd2237] text-[14px] font-bold active:opacity-70 disabled:opacity-40"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {detachBusy
                  ? "Detaching…"
                  : "Detach this device from ward"}
              </button>
            </div>
          </div>
        )}

        {/* Data Sync */}
        <div className="flex flex-col">
          <div className="px-[10px] py-[10px]">
            <p
              className="font-semibold text-[#0f172a] text-[16px] leading-[24px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Data Sync
            </p>
            <p
              className="text-[#8e8e93] text-[12px] mt-[2px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              {draft.hospitalId
                ? "Send a full snapshot of wards, beds, and patients to Mediboard — manually or once a day."
                : "Send a full snapshot of wards, beds, and patients to an external endpoint — manually or once a day."}
            </p>
          </div>

          <div
            className="rounded-[14px] border-[0.726px] border-[rgba(0,0,0,0.1)] p-[12px] flex flex-col gap-[12px]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
            }}
          >
            {/* Endpoint URL — only relevant when not linked to Mediboard,
                since a linked device already knows exactly where to sync */}
            {draft.hospitalId ? (
              <div className="flex items-center gap-[8px] bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] px-[13px] h-[40px]">
                <span
                  className="text-[13px] font-medium text-[#156f48]"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  ✓ Automatically syncing to Mediboard
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-[6px]">
                <p
                  className="font-semibold text-[#2b2b2b] text-[11px] leading-[16.5px] tracking-[0.55px] uppercase"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Endpoint URL
                </p>
                <div className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] relative">
                  <input
                    value={draft.syncEndpoint ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        syncEndpoint: e.target.value,
                      }))
                    }
                    onFocus={(e) => openFor(e.currentTarget)}
                    placeholder="https://your-server.com/api/beds-sync"
                    autoComplete="off"
                    className="absolute inset-0 w-full h-full px-[13px] bg-transparent font-medium text-[13px] text-[#0f172a] placeholder-[rgba(15,23,42,0.4)] focus:outline-none"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  />
                </div>
              </div>
            )}

            {/* Auto-sync toggle — generic-endpoint mode only. A linked
                device always syncs in real time and every few minutes;
                there is deliberately no switch to turn that off. */}
            {!draft.hospitalId && (
            <button
              onPointerDown={() =>
                setDraft((d) => ({
                  ...d,
                  syncEnabled: !d.syncEnabled,
                }))
              }
              className="flex items-center gap-[8px] active:opacity-70"
            >
              <div
                className="w-[40px] h-[24px] rounded-full relative transition-colors shrink-0"
                style={{
                  backgroundColor: draft.syncEnabled
                    ? "#156f48"
                    : "#cbd5e1",
                }}
              >
                <div
                  className="absolute top-[3px] size-[18px] rounded-full bg-white transition-all"
                  style={{
                    left: draft.syncEnabled ? "19px" : "3px",
                  }}
                />
              </div>
              <span
                className="text-[13px] font-medium text-[#0f172a]"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Keep synced automatically
              </span>
            </button>
            )}

            {/* Sync Now + status */}
            <div className="flex items-center justify-between gap-[12px] pt-[4px] border-t border-black/10">
              <div className="pt-[10px]">
                {syncStatus === "sending" && (
                  <span className="text-[12px] text-[#3469b2]">
                    Syncing…
                  </span>
                )}
                {syncStatus === "success" && (
                  <span className="text-[12px] text-[#156f48] font-medium">
                    ✓ Synced successfully
                  </span>
                )}
                {syncStatus === "error" && (
                  <span className="text-[12px] text-[#dd2237] font-medium">
                    ✗ Failed: {lastSync?.error ?? "Unknown error"}
                  </span>
                )}
                {syncStatus === "idle" && lastSync && (
                  <span className="text-[12px] text-[#8e8e93]">
                    Last sync:{" "}
                    {new Date(lastSync.at).toLocaleString()}
                    {lastSync.error ? ` (failed: ${lastSync.error})` : ""}
                  </span>
                )}
                {syncStatus === "idle" && !lastSync && (
                  <span className="text-[12px] text-[#8e8e93]">
                    Never synced yet
                  </span>
                )}
              </div>
              <button
                onPointerDown={() => {
                  onSave(draft);
                  onSyncNow(draft);
                }}
                disabled={
                  !(draft.hospitalId || draft.syncEndpoint) ||
                  syncStatus === "sending"
                }
                className="shrink-0 bg-[#3469b2] h-[38px] px-[16px] rounded-[10px] flex items-center justify-center gap-[8px] active:opacity-80 disabled:opacity-40"
              >
                <RefreshCw
                  size={14}
                  className={`text-white ${syncStatus === "sending" ? "animate-spin" : ""}`}
                />
                <span
                  className="text-white text-[13px] font-semibold"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {syncStatus === "sending" ? "Syncing…" : "Sync Now"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Security — Change PIN */}
        <div className="flex flex-col">
          <div className="px-[10px] py-[10px]">
            <p
              className="font-semibold text-[#0f172a] text-[16px] leading-[24px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Security
            </p>
            <p
              className="text-[#8e8e93] text-[12px] mt-[2px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              {pinChanged
                ? "Custom PIN set for this device."
                : "Using the default PIN — consider setting a custom one."}
            </p>
          </div>

          <div
            className="rounded-[14px] border-[0.726px] border-[rgba(0,0,0,0.1)] p-[12px] flex flex-col gap-[12px]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(52,105,178,0.1) 0%, rgba(52,105,178,0.1) 100%), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)",
            }}
          >
            <div className="flex items-end gap-[10px]">
              <div className="flex flex-col gap-[6px] flex-1">
                <p
                  className="font-semibold text-[#2b2b2b] text-[11px] leading-[16.5px] tracking-[0.55px] uppercase"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  New PIN
                </p>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setPinModalField("new");
                  }}
                  className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] relative flex items-center px-[13px]"
                >
                  <span
                    className={`font-bold tracking-[4px] text-[14px] ${newPin ? "text-[#0f172a]" : "text-[rgba(15,23,42,0.3)]"}`}
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {newPin || "1234"}
                  </span>
                </button>
              </div>
              <div className="flex flex-col gap-[6px] flex-1">
                <p
                  className="font-semibold text-[#2b2b2b] text-[11px] leading-[16.5px] tracking-[0.55px] uppercase"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Confirm PIN
                </p>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setPinModalField("confirm");
                  }}
                  className="bg-white h-[40px] rounded-[10px] border border-[rgba(0,0,0,0.1)] relative flex items-center px-[13px]"
                >
                  <span
                    className={`font-bold tracking-[4px] text-[14px] ${confirmPin ? "text-[#0f172a]" : "text-[rgba(15,23,42,0.3)]"}`}
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {confirmPin || "1234"}
                  </span>
                </button>
              </div>
              <button
                onPointerDown={handleChangePin}
                disabled={pinStatus === "saving"}
                className="shrink-0 bg-[#3469b2] h-[40px] px-[16px] rounded-[10px] flex items-center justify-center active:opacity-80 disabled:opacity-40"
              >
                <span
                  className="text-white text-[13px] font-semibold"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Save PIN
                </span>
              </button>
            </div>

            {pinError && (
              <p className="text-[#dd2237] text-[11px] font-medium">
                {pinError}
              </p>
            )}

            {(pinStatus === "success" || pinStatus === "saving") && (
              <div>
                {pinStatus === "success" && (
                  <span className="text-[12px] text-[#156f48] font-medium">
                    ✓ PIN updated
                  </span>
                )}
                {pinStatus === "saving" && (
                  <span className="text-[12px] text-[#3469b2]">
                    Saving…
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detach — ward PIN, verified against Mediboard by the modal, then
          forwarded so the detach endpoint can verify it again. */}
      {detachPinOpen && (
        <PinModal
          config={config}
          onSuccess={runDetach}
          onCancel={() => setDetachPinOpen(false)}
        />
      )}

      {/* Ward details modal — view-only, managed from Mediboard. */}
      {wardModal && (
        <WardModal
          ward={wardModal}
          onClose={() => setWardModal(null)}
        />
      )}

      {/* PIN entry modal — digits-only keypad, shared by both New PIN and
          Confirm PIN (pinModalField picks which state it's bound to). */}
      {pinModalField && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onPointerDown={() => setPinModalField(null)}
        >
          <div
            className="bg-white rounded-[16px] w-full overflow-hidden shadow-2xl flex flex-col"
            style={{ maxWidth: "420px" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 shrink-0">
              <div className="w-5" />
              <p className="flex-1 text-center font-semibold text-[#0f172a] text-[16px]">
                {pinModalField === "new"
                  ? "New PIN"
                  : "Confirm PIN"}
              </p>
              <button
                type="button"
                onPointerDown={() => setPinModalField(null)}
                className="shrink-0 size-5 flex items-center justify-center active:opacity-60 text-[#2b2b2b] text-[18px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 shrink-0">
              <div className="bg-[#f4f6f9] h-[64px] rounded-[12px] border-2 border-[#3469b2] flex items-center justify-center">
                <span className="font-bold tracking-[10px] text-[28px] text-[#0f172a]">
                  {(pinModalField === "new"
                    ? newPin
                    : confirmPin
                  ).padEnd(4, "•")}
                </span>
              </div>
            </div>
            <NumericKeypad
              value={pinModalField === "new" ? newPin : confirmPin}
              onChange={
                pinModalField === "new" ? setNewPin : setConfirmPin
              }
              maxLength={4}
              onOk={() =>
                setPinModalField((f) =>
                  f === "new" ? "confirm" : null,
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
