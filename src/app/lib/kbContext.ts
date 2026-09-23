import { createContext } from "react";
import type { KbCtxType } from "../types";

// ─── KEYBOARD CONTEXT ─────────────────────────────────────────────────────────

export const KbContext = createContext<KbCtxType>({
  isOpen: false,
  activeEl: { current: null },
  numeric: false,
  openFor: () => {},
  dismiss: () => {},
});
