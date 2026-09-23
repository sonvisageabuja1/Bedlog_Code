import { useState } from "react";
import { Settings } from "lucide-react";
import type { AppConfig } from "../types";
import { verifyMediboardPin, setMediboardPin } from "../lib/mediboard";
import {
  hashPin,
  getCachedPinHash,
  setCachedPinHash,
} from "../lib/pin";

// ─── SETTINGS PIN MODAL ───────────────────────────────────────────────────────
// Verifies live against Mediboard when the device is linked and online —
// falls back to a locally-cached hash (never plain text) otherwise, so
// Settings stays reachable offline. See mediboard_open_questions memory for
// the full agreed design, including the "1234 self-registers on first use"
// behavior below.

const DEFAULT_PIN = "1234";

export function PinModal({
  config,
  onSuccess,
  onCancel,
}: {
  config: AppConfig;
  // Receives the PIN that was just verified, for callers that must forward
  // it to a PIN-guarded Mediboard endpoint (e.g. detach).
  onSuccess: (pin: string) => void;
  onCancel: () => void;
}) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const fail = (message: string) => {
    setShake(true);
    setError(message);
    setTimeout(() => {
      setDigits([]);
      setShake(false);
      setError("");
    }, 800);
  };

  const checkPin = async (pin: string) => {
    const ward = config.wards[0];
    const linked = !!(config.hospitalId && ward?.id);

    if (linked && navigator.onLine) {
      try {
        const outcome = await verifyMediboardPin(
          config.hospitalId!,
          ward!.id,
          pin,
        );
        if (outcome === "valid") {
          setCachedPinHash(await hashPin(pin));
          return true;
        }
        if (outcome === "not_set" && pin === DEFAULT_PIN) {
          // First-ever use on this ward — silently register the default
          // as the real Mediboard PIN instead of failing.
          await setMediboardPin(config.hospitalId!, ward!.id, pin);
          setCachedPinHash(await hashPin(pin));
          return true;
        }
        return false;
      } catch {
        // Couldn't reach Mediboard even after the retry — fall back to
        // the local cache rather than lock the device out entirely.
      }
    }

    return (await hashPin(pin)) === (await getCachedPinHash());
  };

  const press = (d: string) => {
    if (digits.length >= 4 || checking) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 4) {
      setChecking(true);
      checkPin(next.join(""))
        .then((ok) => {
          setChecking(false);
          if (ok) {
            onSuccess(next.join(""));
          } else {
            fail("Incorrect PIN");
          }
        })
        .catch(() => {
          setChecking(false);
          fail("Couldn't verify PIN");
        });
    }
  };

  const del = () => setDigits((d) => d.slice(0, -1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-[280px] overflow-hidden">
        {/* Header */}
        <div className="bg-[#3469b2] px-6 pt-5 pb-4 text-center">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Settings size={20} color="white" />
          </div>
          <p className="text-white font-bold text-[15px]">
            Settings Access
          </p>
          <p className="text-white/70 text-[11px] mt-0.5">
            Enter PIN to continue
          </p>
        </div>

        {/* Dots */}
        <div
          className={`flex justify-center gap-4 py-5 transition-all ${shake ? "animate-[shake_0.4s_ease]" : ""}`}
          style={shake ? { animation: "shake 0.4s ease" } : {}}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full border-2 transition-all"
              style={{
                borderColor: error ? "#dd2237" : "#3469b2",
                backgroundColor:
                  i < digits.length
                    ? error
                      ? "#dd2237"
                      : "#3469b2"
                    : "transparent",
              }}
            />
          ))}
        </div>
        {error && (
          <p className="text-center text-[#dd2237] text-xs font-semibold -mt-3 mb-2">
            {error}
          </p>
        )}
        {checking && !error && (
          <p className="text-center text-[#64748b] text-xs font-semibold -mt-3 mb-2">
            Checking…
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-0 border-t border-black/10">
          {[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "",
            "0",
            "⌫",
          ].map((k, i) => {
            if (k === "") return <div key={i} />;
            return (
              <button
                key={i}
                disabled={checking}
                onPointerDown={(e) => {
                  e.preventDefault();
                  k === "⌫" ? del() : press(k);
                }}
                className="h-14 flex items-center justify-center text-[18px] font-semibold text-[#0f172a] active:bg-[rgba(52,105,178,0.1)] border-b border-r border-black/[0.06] transition-colors last:text-[#64748b] disabled:opacity-40"
              >
                {k}
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onCancel();
          }}
          className="w-full py-3 text-sm font-semibold text-[#64748b] border-t border-black/10 active:bg-[#f4f6f9]"
        >
          Cancel
        </button>
      </div>
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}
