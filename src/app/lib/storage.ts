// ─── UTILS ────────────────────────────────────────────────────────────────────

export const ls = {
  get: <T,>(k: string, fb: T): T => {
    try {
      return JSON.parse(localStorage.getItem(k)!) ?? fb;
    } catch {
      return fb;
    }
  },
  set: <T,>(k: string, v: T) =>
    localStorage.setItem(k, JSON.stringify(v)),
  remove: (k: string) => localStorage.removeItem(k),
};
