// ─── NUMERIC KEYPAD ───────────────────────────────────────────────────────────
// A dedicated, digits-only keypad for PIN entry — deliberately not a mode of
// the general KeyboardPad (VirtualKeyboard.tsx). A PIN can never contain a
// letter or symbol, so there's nothing to gain from the shared keyboard's
// shift/symbols toggling here, only room for confusion; a plain 0-9 grid is
// simpler and matches how a real PIN pad looks. Controlled directly via
// value/onChange rather than manipulating a ref'd input's native value —
// there's no arbitrary target field to reach into, just the PIN string.
export function NumericKeypad({
  value,
  onChange,
  maxLength = 4,
  onOk,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  // Deliberately generic — what "OK" actually does (close vs. advance to
  // another field) is the caller's business, not this component's.
  onOk?: () => void;
}) {
  const press = (d: string) => {
    if (value.length >= maxLength) return;
    onChange(value + d);
  };
  const del = () => onChange(value.slice(0, -1));

  return (
    <div className="bg-[#1e293b] p-4">
      <div className="grid grid-cols-3 gap-3 max-w-[300px] mx-auto">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onPointerDown={(e) => {
              e.preventDefault();
              press(d);
            }}
            className="h-16 text-2xl font-semibold text-white bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-lg"
          >
            {d}
          </button>
        ))}
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            del();
          }}
          className="h-16 flex items-center justify-center text-lg font-bold text-white bg-red-800 hover:bg-red-700 rounded-lg"
        >
          ⌫
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            press("0");
          }}
          className="h-16 text-2xl font-semibold text-white bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-lg"
        >
          0
        </button>
        {onOk && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onOk();
            }}
            className="h-16 text-lg font-bold text-white bg-[#3469b2] hover:bg-[#2d5a96] rounded-lg"
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
}
