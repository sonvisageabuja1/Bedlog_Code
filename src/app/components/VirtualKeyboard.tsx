import { useContext, useEffect, useState } from "react";
import { KbContext } from "../lib/kbContext";

// ─── VIRTUAL KEYBOARD ─────────────────────────────────────────────────────────

// Digits live on the main layout permanently — most real fields here are
// numbers or alphanumeric combos (hospital numbers like "H100", "TEST123"),
// so a separate numbers-only panel just meant an extra toggle tap every
// time a field needed both. Symbols are the genuinely rare case, so they're
// the one thing still tucked behind a toggle.
// Letters in standard QWERTY reading order, just wrapped into 2 rows of 13
// instead of the usual 3 (10/9/7) — same familiar key positions, fewer rows.
const KB_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a", "s", "d"],
  ["f", "g", "h", "j", "k", "l", "z", "x", "c", "v", "b", "n", "m"],
];
const SYMBOL_ROWS = [["-", "_", ".", "@", "/", "(", ")", "+", "#", "%"]];

// The actual keyboard UI — key rows, shift/symbols toggling, press/delete
// logic — deliberately independent of KbContext so it can be reused
// anywhere a field needs its own self-contained keyboard (see
// DashboardPage's hospital-number entry modal) without going through the
// global isOpen/activeEl state that also drives App.tsx's keyboard-clearance
// padding on <main>. `VirtualKeyboard` below is just the thin, global-context
// flavored wrapper around this.
export function KeyboardPad({
  targetRef,
  onDone,
}: {
  targetRef: React.RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);

  const press = (ch: string) => {
    const el = targetRef.current;
    if (!el) return;
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? el.value.length;
    const val = el.value.slice(0, s) + ch + el.value.slice(e);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(s + ch.length, s + ch.length);
    el.focus();
    // Caps-lock style — stays on until Shift is pressed again, rather than
    // resetting after one character.
  };

  const del = () => {
    const el = targetRef.current;
    if (!el) return;
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? el.value.length;
    const hasSel = s !== e;
    const start = hasSel ? s : Math.max(0, s - 1);
    const val =
      el.value.slice(0, start) + el.value.slice(hasSel ? e : s);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(start, start);
    el.focus();
  };

  const rows = symbols ? SYMBOL_ROWS : KB_ROWS;

  return (
    <div
      className="bg-[#1e293b] border-t-2 border-[#3469b2] shadow-2xl"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700">
        <div className="flex gap-3">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              setSymbols(!symbols);
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${symbols ? "bg-[#3469b2] text-white" : "bg-slate-700 text-slate-300"}`}
          >
            {symbols ? "ABC" : "#+="}
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              setShift(!shift);
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${shift ? "bg-[#3469b2] text-white" : "bg-slate-700 text-slate-300"}`}
          >
            ⇧ Shift
          </button>
        </div>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onDone();
          }}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-700 text-slate-300"
        >
          Done ✓
        </button>
      </div>
      <div className="px-3 py-3 space-y-2">
        {rows.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-2">
            {row.map((k) => (
              <button
                key={k}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(shift && !symbols ? k.toUpperCase() : k);
                }}
                className="flex-1 h-14 max-w-[80px] bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white text-lg font-medium rounded-lg"
              >
                {shift && !symbols ? k.toUpperCase() : k}
              </button>
            ))}
            {ri === rows.length - 1 && (
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  del();
                }}
                className="h-14 px-5 bg-red-800 hover:bg-red-700 text-white text-lg font-bold rounded-lg ml-1"
              >
                ⌫
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2 mt-1">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              setSymbols(!symbols);
            }}
            className="h-14 px-5 bg-slate-700 text-slate-300 text-base rounded-lg"
          >
            {symbols ? "ABC" : "#+="}
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              press(" ");
            }}
            className="flex-1 h-14 bg-slate-600 text-white text-lg rounded-lg"
          >
            Space
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              press(".");
            }}
            className="h-14 px-5 bg-slate-700 text-slate-300 text-lg rounded-lg"
          >
            .
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onDone();
            }}
            className="h-14 px-6 bg-[#3469b2] text-white text-lg font-bold rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Global, shared keyboard — fixed to the bottom of the viewport, driven by
// KbContext (App.tsx's kbOpen/activeEl), used by every field in the app
// except DashboardPage's hospital-number modal (see KeyboardPad above).
export function VirtualKeyboard() {
  const { isOpen, activeEl, dismiss } = useContext(KbContext);
  const [openCount, setOpenCount] = useState(0);

  // Remounts KeyboardPad (via the key below) on every open so it always
  // starts back on the main (non-symbols) layout for a fresh field, same as
  // before this refactor.
  useEffect(() => {
    if (isOpen) setOpenCount((n) => n + 1);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[250]">
      <KeyboardPad key={openCount} targetRef={activeEl} onDone={dismiss} />
    </div>
  );
}
