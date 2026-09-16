# BedLog — Full Handoff Documentation & PRD

**Purpose of this document**: a complete, self-contained reference to BedLog — what it is, why it's built the way it is, how every piece works, and every known gap or unresolved issue. Written so a developer (or a fresh Claude Code session with no prior context) can pick up this project cold and be fully oriented without re-deriving anything documented here.

Last updated: 2026-09-09.

---

## 1. What BedLog Is

BedLog is a **hospital ward bed-management kiosk app** — a single-page React application that runs fullscreen on a dedicated touchscreen device (a Raspberry Pi in a kiosk enclosure) mounted in one hospital ward. Ward staff use it to admit patients to beds, discharge them (with an outcome: discharged / deceased / LAMA / absconded), move patients between beds, mark beds out of rotation (cleaning/maintenance/reserved), and see basic occupancy reports.

**One device = one ward.** Each kiosk is onboarded once against a specific ward in a specific hospital and stays bound to it. It is not a multi-ward or multi-hospital app from a single device's perspective.

**BedLog has no backend of its own.** There is no server, no database, nothing deployed alongside it except a plain static file server. All app state (ward config, beds, patients) lives entirely in the kiosk browser's `localStorage`. The only backend BedLog talks to is an external system called **Mediboard**.

### Relationship to Mediboard

Mediboard (`https://api.mediboards.io`) is a separate, hospital-wide system built and operated by a different developer/team. It is the **source of truth for ward structure** (which wards exist, their names, codes, bed counts, departments) and the **destination for sync** (BedLog pushes admit/discharge/bed-status data to it). BedLog does not create or edit wards — every ward a kiosk can be onboarded against must already exist in Mediboard's system.

This relationship, and the friction of integrating against a live, evolving external API, is the largest source of complexity and historical bugs in this project (see §6).

---

## 2. Product Requirements

### 2.1 Users

- **Ward staff** (nurses, ward clerks) — the primary users, operating the kiosk directly via touch. No keyboard/mouse assumed; the app provides its own on-screen keyboard.
- **Ward matron / hospital admin** — consumes the Reports screen and (per a newer, separate initiative) an RGB LED matrix display fed by BedLog data (see §8).
- **Mediboard** — not a human user, but effectively a second "actor" the system is built around: every real deployment is Mediboard-linked, and most of BedLog's business logic exists to stay correctly synced with it.

### 2.2 Core user flows (current, shipped)

1. **Onboarding** (first run, or after a reset) — pick a real hospital and ward from Mediboard, register or inherit a device identity, land on the dashboard. Full detail in §4.5.
2. **Quick Admission (Dashboard)** — type a hospital number; if it matches a currently-admitted patient, discharge-type buttons appear; otherwise pick an available bed and admit.
3. **Bed Maps** — a full visual grid of every bed, filterable by ward/status/search; tap a bed to admit, change status, discharge, or transfer.
4. **Reports** — occupancy stats + activity counts (admitted/discharged/deceased/LAMA/absconded/transferred), filterable by today/week/month/all; drills into full Admissions History.
5. **Settings** (PIN-gated) — view hospital/ward/device identity (read-only), configure Data Sync, change the PIN.

### 2.3 Explicit product principles (decided, not just implemented)

- **BedLog never creates or edits ward structure.** Every ward field shown is read-only, sourced from Mediboard. (Decided 2026-09-01, after earlier onboarding versions let admins create/edit wards locally — removed entirely.)
- **BedLog must never be given destructive/irreversible API capability** (e.g. delete-ward, delete-bed), even if Mediboard were to offer one. That belongs on Mediboard's own admin side. This is a deliberate, standing design constraint — see memory `bedlog_no_destructive_ops`. Read-only and additive/reversible writes (admit, discharge, status change, sync) are the only shape of operation this device should ever perform.
- **The PIN is a physical-access deterrent, not real security.** A 4-digit PIN's keyspace is trivially bruteforceable; it's hashed locally (never stored in plaintext) as "a modest improvement over plain text," not real cryptographic protection. The actual security boundary is physical control of the device. (See §4.7 and the open `bedlog_security_code_auth_design` question about whether a real per-ward API key should eventually replace/augment this.)
- **Real-time sync when online, full-snapshot reconciliation as the catch-up mechanism** — no formal offline queue/outbox. A full `/sync` call (idempotent by design) fires on every bed/patient change while online, plus a periodic staleness check as a backstop. This was a deliberate simplification once per-action Mediboard endpoints (`/admit`, `/discharge`) turned out to be broken/unwired (see §6).

### 2.4 Deferred / explicitly out-of-scope features

These are designed (in some cases fully speced) but intentionally not built yet. Full detail lives in the project's Claude memory files (see §10); summarized here so this doc alone is enough to resume the work:

- **"Reload" button in Settings** — pull fresh ward/bed *structure* from Mediboard (bed count changes, renames) without a full re-onboard, while never overwriting local occupancy data (BedLog is the source of truth for occupancy, not structure). On hold pending a decision on the one unresolved edge case: what happens to a bed that's occupied locally but no longer exists on Mediboard's side at all.
- **"Reset This Device" action in Settings** — PIN-gated, with a confirmation step beyond the PIN, wipes `bl_config`/`bl_beds`/`bl_patients`/`bl_last_sync`/`bl_last_successful_sync`/cached PIN (deliberately *keeps* `bl_device_id`), routes back to onboarding. Distinct from the automatic "invalid config → NeedsSetupScreen" safety net — this is a deliberate human action for repurposing/returning a physical unit. On hold pending dev-team discussion.
- **Per-ward security-code / API-key onboarding gate** — since Mediboard's API currently has zero authentication (see §6.9), a proposed design adds an "Enter Security Code" screen before onboarding, scoped per-ward, which could also double as the mechanism for identifying which ward a code belongs to (potentially simplifying/removing the searchable hospital/ward picker for devices that already have a code). Three specific open questions block this (does code-validation also return a `deviceId`; is the old picker ever still needed as a fallback; how does a code physically reach whoever's setting up a kiosk) — not yet sent to/answered by the Mediboard developer.

### 2.5 Non-functional expectations

- Runs unattended, 24/7, fullscreen, on a Raspberry Pi with no keyboard/mouse attached.
- Must survive power loss and reboot with all local state intact (this took real work to get right — see §7).
- Must tolerate intermittent/no internet (kiosk continues to function locally; sync catches up when connectivity returns).
- No login/session concept beyond the single shared PIN for Settings access.

---

## 3. Architecture Overview

| Layer | Choice |
|---|---|
| Framework | React 18.3.1 + TypeScript 5.7 |
| Build tool | Vite 6.3.5 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no separate `tailwind.config.js`) |
| Package manager | pnpm |
| Routing | None — a single `Page` union type (`"dashboard" | "bedmaps" | "admissions" | "reports" | "admissions-history" | "settings"`), manually switched in `App.tsx` |
| State management | Plain React `useState`/`useCallback` in `App.tsx`; no Redux/Zustand/Context beyond one small keyboard context |
| Persistence | Browser `localStorage` only, via a single wrapper (`lib/storage.ts`) |
| Backend | **None.** The only network calls are direct browser `fetch()`s to Mediboard's public API |
| Icons | `lucide-react` (a handful of icons) + hand-written SVG components using path data extracted from Figma |
| Deployment target | Raspberry Pi, static build served by `serve`, displayed fullscreen in Chromium under a `cage` Wayland compositor (see §7) |

**Important operational fact**: this project currently has **no git repository** (`git init` has never been run in this directory). Before any real developer handoff or collaboration, initializing git (with a `.gitignore` excluding `dist/`, `node_modules/`) should be step one — right now there is no version history, no branching, no way to review or revert changes.

### 3.1 Directory map

```
src/main.tsx                 React entry point
src/app/App.tsx              Main component: app-state machine, all top-level state, all actions
src/app/types.ts             Every shared type (Ward, Bed, Patient, AppConfig, etc.) — see §5
src/app/constants.ts         Bed status colors/labels, activity metadata, discharge TTL
src/app/lib/
  storage.ts                 The only module that touches localStorage directly
  sync.ts                    Device identity, generic (non-Mediboard) sync, local bed reconciliation
  mediboard.ts                The Mediboard API client — the largest, most complex file (~720 lines)
  pin.ts                     PIN hashing + local cache (SHA-256, never plaintext)
  id.ts                      Trivial local id generator
  kbContext.ts               React context backing the virtual keyboard
  beds.ts                    Display-only bed numbering helper
  time.ts                    Date/time formatting helpers
src/app/pages/                6 route-level screens (Dashboard, BedMaps, Admissions, AdmissionsHistory, Reports, Settings)
src/app/components/           Onboarding, PIN modal, splash, needs-setup, virtual keyboard, top bar, ward modal, small presentational bits
src/app/components/icons/     Hand-written SVG icon components
src/assets/bed-icons/         5 illustrated per-status bed SVGs
src/imports/                  Figma Make export leftovers — see §3.3
esp-bridge/                   Standalone ESP32 ward-display add-on — see §8 (NOT part of the built app)
dist/                         A stale prior production build sitting in the working directory
```

### 3.2 The app-state machine (`App.tsx`)

```
"splash" --(SplashScreen.onDone)--> "needsSetup" | "ready"   [based on isConfigValid(config)]
"needsSetup" --(NeedsSetupScreen "Set Up This Device")--> "onboarding"
"onboarding" --(OnboardingScreen.onComplete)--> "ready"
"ready"  →  the real app: TopBar + active Page + bottom nav (Dashboard/Bed Maps) + VirtualKeyboard + conditional PinModal
```

`isConfigValid(config)` (`lib/sync.ts`) is the single source of truth for whether a device counts as onboarded: `!!config.hospitalId && config.wards.length > 0`. This exists specifically so a corrupted or interrupted onboarding is never mistaken for a completed one (see §6.1 for the bug this was built to prevent).

### 3.3 `src/imports/` — what it is and whether it matters

This is raw output from the original Figma Make export: one folder per exported Figma frame, each with a full (unused) reference `index.tsx` and a `svg-<hash>.ts` file of raw SVG path-data strings. **The hand-written app in `src/app/` does not import any of the `index.tsx` reference implementations** — it only imports individual `svgPaths` objects from a handful of these folders, for small icon glyphs (the logo pieces, the flame mark, a couple of search/status icons). Safe to think of this directory as a big bag of extracted SVG path data plus unused reference screens, not something the real app is structurally dependent on.

### 3.4 Known code-quality notes

- `tsconfig.json` has `strict: false`, `noImplicitAny: false` — loose typing throughout.
- No test suite, no lint script, no `serve`/`start` script in `package.json` (deployment's `serve` invocation is entirely external to this repo — see the separate Kiosk Deploy Runbook).
- `devDependencies` include macOS-ARM-specific native binaries (`@rollup/rollup-darwin-arm64`, `lightningcss-darwin-arm64`) — irrelevant for a Linux/ARM Pi build; package managers resolve the correct platform binary automatically, but worth knowing if setting up CI.
- Minor inconsistency: `BED_MAPS_LEGEND`'s "Available" color (`#ebebeb`) differs from `BED_MAPS_STATUS.available.color` (`#b4b4b4`) in `constants.ts` — not verified whether intentional.
- **`AdmissionsPage.tsx` (`src/app/pages/`) appears to be orphaned/unreachable.** It's a fully built page (searchable active+recently-discharged patient list) and `"admissions"` is a valid `Page` value rendered in `App.tsx`'s switch — but nothing in the codebase ever calls `setPage("admissions")`. Worth a deliberate decision: wire it into navigation, or remove it as dead code.

---

## 4. Core Mechanics

### 4.1 Data model (`src/app/types.ts`, verbatim)

```ts
export type BedStatus = "available" | "occupied" | "cleaning" | "reserved" | "maintenance";
export type Page = "dashboard" | "bedmaps" | "admissions" | "reports" | "admissions-history" | "settings";
export type DischargeType = "discharged" | "deceased" | "lama" | "absconded" | "transferred";

export interface Ward {
  id: string;
  name: string;
  code: string;
  bedCount: number;
  floor: string;
}
export interface Bed {
  id: string;
  number: string;
  wardId: string;
  status: BedStatus;
  patientId?: string;
  updatedAt: number;
}
export interface Patient {
  id: string;
  hospitalNumber: string;
  admittedAt: number;
  bedId: string;
  wardId: string;
  status: "admitted" | "discharged";
  dischargeType?: DischargeType;
  dischargedAt?: number;
}
export interface AppConfig {
  hospitalName: string;
  hospitalId?: string;      // set once linked during onboarding
  wards: Ward[];
  syncEndpoint?: string;    // only used when NOT Mediboard-linked — see §4.3
  syncEnabled?: boolean;
  deviceId: string;         // stable per-install identity
  deviceLabel?: string;
}
export type ActivityFilter = "today" | "week" | "month" | "all";
```

### 4.2 Persistence — every localStorage key

`lib/storage.ts`'s `ls.get`/`ls.set` wrapper is the *only* code in the app that touches `localStorage`. Every key is prefixed `bl_`:

| Key | Holds | Written by |
|---|---|---|
| `bl_config` | The `AppConfig` object | `App.tsx`, on every config change + onboarding complete |
| `bl_beds` | `Bed[]` | `App.tsx`, on every beds change + onboarding complete |
| `bl_patients` | `Patient[]` | `App.tsx`, on every patients change + onboarding complete |
| `bl_last_sync` | `{ at: number; error?: string } \| null` — every sync attempt | `App.tsx`'s `triggerSync` |
| `bl_last_successful_sync` | `number \| null` — last *successful* sync timestamp | `App.tsx`'s `triggerSync`, only on success |
| `bl_device_id` | Stable per-install UUID | `lib/sync.ts` |
| `bl_cached_pin_hash` | SHA-256 hex hash of the current PIN (never plaintext) | `lib/pin.ts` |
| `bl_pin_changed` | Boolean — has an admin ever explicitly changed the PIN | `lib/pin.ts` |

A full device reset (the deferred "Reset This Device" idea, §2.4) would clear all of these except `bl_device_id`.

### 4.3 Sync mechanism

Two entirely different code paths, chosen automatically based on whether the device is Mediboard-linked:

- **Mediboard-linked** (`config.hospitalId` + a ward present — true for every real production device): `triggerSync()` in `App.tsx` always uses `buildMediboardSyncPayload()` + `syncMediboardWard()` (`lib/mediboard.ts`), POSTing to `https://api.mediboards.io/api/hospital/{hospitalId}/ward/{wardId}/sync`. **There is no admin-configurable URL for this path — it's automatic and not overridable.**
- **Not Mediboard-linked** (a hypothetical generic/test device with no `hospitalId`): falls back to `buildSyncPayload()` + `sendSyncPayload()` (`lib/sync.ts`), POSTing to whatever URL the admin typed into Settings → Data Sync (`config.syncEndpoint`).

**This distinction matters a lot for anyone extending sync behavior** — see §8.3 for a concrete case (the ESP32 bridge) where this was initially designed against the wrong path.

Triggers:
- Real-time: fires immediately whenever `beds` or `patients` state changes, as long as `appState === "ready"`, the device is online, and a sync target exists. Skips the very first render (no spurious sync on load).
- Catch-up: every 60 seconds, checks whether the newest bed/patient timestamp is more recent than `bl_last_successful_sync`; if stale and online, re-fires.

Every attempt (success or failure) writes `bl_last_sync`; only successes update `bl_last_successful_sync`. `syncStatus` (`idle`/`sending`/`success`/`error`) resets to `idle` 3 seconds after settling, driving the transient status indicators in Settings.

### 4.4 Local bed reconciliation (`syncBeds`, `lib/sync.ts`)

Runs on every app load, reconciling persisted `beds` against the current ward config. Deliberately conservative: a ward's beds are left completely untouched as long as the bed *count* still matches config — only a genuine bed-count edit regenerates that ward's beds, and even then only locally-patterned bed numbers (`${wardId}_${n}`) get recomputed, never a real Mediboard-sourced id. This exists because an earlier, naive version silently destroyed real Mediboard bed ids on every single app load (see §6.2) — a subtle but serious historical bug, worth understanding before touching this function again.

### 4.5 Onboarding flow (`OnboardingScreen.tsx`)

Two-step wizard, fully gated on live Mediboard connectivity (no offline/manual bypass):

1. **Hospital search** — `fetchMediboardHospitals()` (`GET /hospital/create` — yes, a GET, despite the path name; it's a list endpoint returning `(hospital, department)` rows, deduped client-side).
2. **Department + Ward** — `fetchMediboardWards(hospitalId)` (`GET /hospital/{id}/ward`), then per-ward background lookups via `fetchMediboardWardInfo()` (`GET /hospital/{id}/ward/{wardId}/device`) to build a department filter and detect wards that already have a registered device.
   - Picking a ward that **already has a device** (`inheritedDevice`) skips registration entirely — just fetches current occupancy via `fetchMediboardWardSeed()` (same `/device` endpoint) and completes immediately.
   - Picking a ward with **no device yet** calls `registerMediboardDevice()` (`POST /hospital/{id}/setup`) to register one, then seeds from the same `/device`-derived state.

`onComplete(config, seed?, deviceOverride?)` hands control back to `App.tsx`'s `handleOnboardingComplete`, which merges the partial config into a full `AppConfig`, applies a real Mediboard-issued `deviceId` if given, seeds beds/patients (from Mediboard if available, else generates empty beds via `makeBeds(wards)`), persists everything, and flips to `"ready"`.

**As of a 2026-09-09 fix, `handleOnboardingComplete` spreads the *previous* `config` before applying the new onboarding fields** — this matters because re-onboarding an already-configured device (e.g. after a reset, or picking up a stale device again) used to silently wipe Settings-only fields like `syncEnabled`/`syncEndpoint` that onboarding itself never touches. See §7.5.

### 4.6 The Mediboard API client (`lib/mediboard.ts`)

Base URL: `https://api.mediboards.io/api`. Every known endpoint:

| Function | Method + Path | Notes |
|---|---|---|
| `fetchMediboardHospitals()` | `GET /hospital/create` | List endpoint despite the name |
| `fetchMediboardWards(hospitalId)` | `GET /hospital/{id}/ward` | No department field returned |
| `fetchMediboardWardInfo(hospitalId, wardId)` | `GET /hospital/{id}/ward/{wardId}/device` | Returns department + deviceId/deviceLabel (null if unset) |
| `fetchMediboardWardSeed(hospitalId, wardId)` | same `/device` endpoint | Extracts beds/patients for onboarding seed |
| `registerMediboardDevice(hospitalId, {departmentName, ward})` | `POST /hospital/{id}/setup` | Only endpoint that issues a `deviceId`; registers against an *existing* ward, never creates one |
| `syncMediboardWard(hospitalId, wardId, payload)` | `POST /hospital/{id}/ward/{wardId}/sync` | Day-to-day sync |
| `verifyMediboardPin(hospitalId, wardId, pin)` | `POST /hospital/{id}/ward/{wardId}/pin/verify` | 404→not_set, 401→invalid, 200+valid→valid |
| `setMediboardPin(hospitalId, wardId, pin)` | `PUT /hospital/{id}/ward/{wardId}/pin` | Admin change, or silent self-registration of default `1234` |
| Ward bed-status stats | `GET /hospital/{id}/ward/{wardId}/stats` | Bed-status counts only — no activity/admission counts. See §8 |

`withColdStartRetry()` wraps the register/sync/verify/set-pin calls: retries once after 1.5s if the failure is a `TypeError` (browser-level network failure, characteristic of the API's hosting cold-starting after idling). `mediboardFetch<T>()` is the shared GET helper (throws on non-ok or `success:false`).

**The exact `/sync` payload shape** (`buildMediboardSyncPayload`) has real, non-obvious quirks baked in from hard-won live testing — see §6.3 through §6.6 before modifying this function.

### 4.7 PIN / Settings gating

- The gear icon in `TopBar` opens `PinModal`; there is no other route to Settings.
- On 4-digit entry, if Mediboard-linked and online: `verifyMediboardPin()`. Valid → unlock + re-cache. Not-set + exactly `"1234"` entered → self-registers `1234` as the ward's real Mediboard PIN (first-ever use effectively "claims" the default). Otherwise fails. Any network failure (even after retry) falls through to the offline path.
- Offline (or Mediboard unreachable): compares the typed PIN's SHA-256 hash against the locally cached hash (`bl_cached_pin_hash`, defaulting to the hash of `"1234"`).
- **The PIN is never stored in plaintext locally.** It is sent as plaintext in the request body to Mediboard over HTTPS (standard for a server-side verify call), but the local cache only ever holds a hash.

### 4.8 Virtual keyboard

Since the kiosk has no physical keyboard, every text/number field opens an on-screen keyboard (`VirtualKeyboard.tsx`) instead. Wiring: a single `KbContext` (`lib/kbContext.ts`) provided once in `App.tsx`; any input calls `openFor(inputRef.current, isNumeric)` on focus. The keyboard manipulates the focused `<input>` DOM node directly via the native value setter + a dispatched `input` event (so React's controlled-input `onChange` still fires) rather than going through React state per-field — this lets one generic keyboard work against whatever field is currently focused without bespoke per-page handlers.

---

## 5. Known Historical Bugs & Fixes (read before touching related code)

Condensed from extensive live-testing history (full detail in the project's Claude memory, `mediboard_open_questions.md`, and this session's own investigation). Ordered roughly by how likely they are to bite someone again.

1. **Dummy/default config could be mistaken for a real completed onboarding (fixed 2026-09-04).** A hardcoded `DEFAULT_CONFIG`/`DEFAULT_WARDS` fallback ("General Ward"/"ICU"/"City General Hospital") used to exist; a timing bug could let an interrupted onboarding leave that dummy data in place, and a later reload would show it as if it were a real completed setup. Fixed by deleting the dummy fallback entirely and introducing `isConfigValid()` as the single, content-based gate (real `hospitalId` + at least one real ward), backed by the dedicated `NeedsSetupScreen`.
2. **`syncBeds()` used to silently destroy real Mediboard bed ids on every app load (fixed 2026-08-24).** It only recognized locally-generated bed-id patterns; any Mediboard-issued UUID bed id got silently replaced with a fresh blank one on every load. Now beds are left untouched as long as the count matches config (§4.4).
3. **`syncEnabled`/`syncEndpoint` used to get silently wiped by re-onboarding (fixed 2026-09-09).** `handleOnboardingComplete` built the post-onboarding config from scratch instead of spreading the previous config first — any Settings-only field not part of onboarding's own payload (hospital/ward/wards) was lost. Fixed by spreading `...config` before `...c`.
4. **Mediboard's `/sync` used to hard-crash (500) whenever a patient's `hospitalNumber` was populated at all** — an extensive, multi-day live-testing saga (every combination of field shape, id format, timestamp format, and value type was tried and ruled out as the cause) eventually traced to a server-side PostgreSQL prepared-statement parameter-count mismatch, fixed by the Mediboard developer 2026-08-26–28. **If any future Mediboard-side 500 shows up, this history is worth reviewing** — the debugging discipline (isolate one variable at a time, reproduce independently via curl/Postman, never assume payload shape is the cause without disproving it directly) is documented in full in `mediboard_open_questions.md`.
5. **Discharge-outcome-type reporting changed shape at least twice before landing correctly (resolved 2026-08-31).** The final, confirmed-working contract: closing an admission requires sending a *distinct new entry* in the `patients` array — same `hospitalNumber`/`bedId`/`wardId`/`admittedAt` as the original admission, but its own new `id` (deterministic suffix `${originalId}-close`, not random, so repeat syncs don't duplicate), a new `updatedAt`, and `status` set to the real outcome (`discharged`/`deceased`/`lama`/`absconded`). Sending the outcome type as a mutation of the *original* admission's `status` field silently does nothing — this was tried, disproved, and is a common wrong turn to avoid repeating.
6. **Mediboard's CORS policy hardcodes a single allowed origin (`http://localhost:5173`) — UNRESOLVED, blocks every real deployment.** `curl` (no `Origin` header) always looks successful, which is why this went undetected for weeks — the very first real kiosk deployment surfaced it, since browsers actually send `Origin` and enforce the response. Current workaround: the kiosk's static server binds port `5173` specifically to match the one allowed origin. **This is fragile and needs a real fix from the Mediboard developer** (either allow real device origins, or drop the restriction to `*` for these endpoints) — see §6.9.
7. **`/setup`'s device-registration contract changed fundamentally 2026-09-01** — BedLog no longer creates wards at all; every ward comes from Mediboard's own account, and `/setup` now registers a device against an *existing* `ward.id`. If you find any lingering code path or comment referencing "create a new ward" from BedLog, it's stale — that capability was deliberately removed.
8. **Kiosk restart/reboot persistence bug (fixed 2026-09-04–05, this session)** — a device could onboard successfully, then silently revert to the setup screen after a restart or power cycle, even though the saved config was genuinely intact on disk. Root cause: the original kiosk setup launched Chromium as a separate systemd service on top of the Pi's normal desktop session, which turned out to have its own independent Chromium instance already running — no dedicated, isolated session for the kiosk. Fixed by rebuilding around a console-only boot with `cage` (a minimal single-purpose Wayland compositor) as the sole compositor for a single Chromium instance. Verified clean across repeated restarts and a full power-off/cold-boot cycle. Full detail, plus two more sub-lessons from the same rebuild (a `raspi-config` boot-behaviour gotcha, and a stale `ExecStart` binary path), is in the separate **Kiosk Deploy Runbook** artifact (link in §7).

---

## 6. Mediboard API — Open Items (as of 2026-09-09)

Everything below is unresolved and worth prioritizing when Mediboard-integration work resumes. (Full historical detail, including every superseded hypothesis, lives in the project's `mediboard_open_questions` memory — this is the current-state summary.)

1. **CORS single-origin restriction** (§5.6) — highest priority; blocks any real device not served from `http://localhost:5173`.
2. **No ward-update endpoint** — onboarding can fetch an existing ward's structure, but there's no way to push a structural edit (e.g. a bed-count change) back to Mediboard; only create-new endpoints exist. Blocks the deferred "Reload button" feature (§2.4).
3. **Unrecognized `deviceId` on `/sync` returns a raw 500, not a clean error** — every other invalid-input case elsewhere in the API returns a proper error message; this one doesn't.
4. **No authentication on any endpoint** — confirmed deliberate by the developer for now, with auth possibly added later. If/when it happens, there are 6 separate raw `fetch()` call sites in `lib/mediboard.ts` with no centralized header-attachment point today; a static per-device API key (likely issued alongside `deviceId` from `/setup`) would be the natural fit and was the direction pushed back toward, over a heavier session/login token model.
5. **Mediboard doesn't recognize `"cleaning"` as a bed status** — silently normalizes it to `"available"` server-side. Low priority (BedLog's own local state is unaffected moment-to-moment), but means a "cleaning" bed's state can't be recovered if that ward is ever re-onboarded.
6. **Field-casing inconsistency**: `/device`'s bed objects use `patient_hospital_number` (snake_case) while the (now-unused) `/bed` endpoint used `patientHospitalNumber` (camelCase) for the same field.
7. **`/hospital/{id}/ward/{wardId}/stats`'s response mixes numeric types** (confirmed live 2026-09-05, not yet reported to the developer): `total_beds`/`total_occupied`/`total_available`/`total_out_of_rotation` are numbers, but `total_maintenance`/`total_reserved` are returned as numeric *strings* (e.g. `"0"`). Any client parsing this should coerce rather than assume a consistent type.
8. **Whether Mediboard has any way to change a ward's PIN independently of BedLog** — unconfirmed; relevant to whether the PIN design's "changed on Mediboard's side, picked up automatically on next online verify" assumption actually holds.

---

## 7. Deployment — Raspberry Pi Kiosk

Full, step-by-step deployment instructions (first-time setup, every-update flow, resetting a device, exiting/re-entering kiosk mode, and a troubleshooting section built entirely from real incidents hit on real hardware) live in a separate, dedicated artifact:

**→ Kiosk Deploy Runbook**: https://claude.ai/code/artifact/f6e65fe4-73d0-4556-a063-10f788831381

Summary of the current architecture (fully detailed in that runbook):

- The Pi boots straight to a console (no desktop), auto-logged-in.
- `bedlog-server.service` — a plain static file server (`serve`) hosting the built `dist/` on port 5173.
- `bedlog-kiosk.service` — launches `cage` (a minimal single-app Wayland compositor) with Chromium as its sole client, in `--kiosk` mode, pointed at `http://localhost:5173`.
- Both are systemd services with `Restart=always`.

Deploying an updated build: `pnpm build` locally, then either copy `dist/` to `/home/pi/bedlog` via USB drive or `rsync`, then `sudo systemctl restart bedlog-server bedlog-kiosk` on the Pi. Full commands in the runbook.

---

## 8. ESP32 Ward-Display Add-on (in progress, not production-ready)

A separate initiative: an RGB LED matrix display (2 chained 64×32 HUB75 panels, driven by an ESP32) mounted for the ward matron, showing the ward name and a live 3-column grid of: **ADM / DIS / DEC / LAMA / ABS / TOT / OCC / AVL** (admit, discharge, deceased, LAMA, absconded, total beds, occupied, available).

### 8.1 Why it isn't a direct Mediboard integration

Mediboard has no endpoint that returns aggregate activity counts (admissions/discharges/deceased/LAMA/absconded) for a ward — only individual action endpoints (create one admission, discharge one, etc.) and a bed-status `/stats` endpoint (occupied/available/etc. only, no activity breakdown). Confirmed by reading every endpoint the Mediboard developer has documented or demonstrated (§4.6) — there is nothing to poll directly for the activity numbers this display needs.

### 8.2 The actual architecture (as built so far)

```
BedLog (browser) --POST--> esp-bridge/server.cjs (Node, runs on the Pi) --GET-- ESP32 (polls every 3s)
```

- **`esp-bridge/server.cjs`** — a small, dependency-free Node HTTP server. Accepts `POST /ingest` with BedLog's existing sync payload shape (full `wards`/`beds`/`patients` arrays — it computes the 8 display numbers itself from raw patient records, including "today" activity counts derived from `admittedAt`/`dischargedAt`/`dischargeType`), and exposes `GET /display` returning `{ ward, totalBeds, occupied, available, admit, discharge, deceased, lama, abscond, updatedAt }`. CORS-open (`Access-Control-Allow-Origin: *`) since it's entirely LAN-local. Verified working via local testing (see esp-bridge test transcript in this session).
- **`esp-bridge/ward_display/ward_display.ino`** — ESP32 Arduino sketch. Connects to WiFi, polls the bridge's `/display` every 3 seconds via `HTTPClient`, parses with `ArduinoJson`, renders via the `ESP32-HUB75-MatrixPanel-I2S-DMA` library: ward name centered/scrolling on top, 3×3 grid of abbreviated stats below (last cell unused).

### 8.3 KNOWN GAP — this does not yet work end-to-end on a real (Mediboard-linked) device

This is the single most important thing to know before deploying this add-on: **the bridge is designed to receive data via BedLog's *generic* sync path (`syncEndpoint`, Settings → Data Sync)** — but per §4.3, that path is only ever used for a device that is **not** Mediboard-linked. Every real production BedLog kiosk **is** Mediboard-linked (onboarding requires a real Mediboard hospital/ward), so `triggerSync()` will never actually call the bridge on a real device — it always routes to Mediboard's own `/sync` instead.

**This means the bridge, as currently built, only works if tested by manually POSTing to it (as done during development) or on a hypothetical non-Mediboard-linked test device — not on any real kiosk as deployed today.**

To make this genuinely work on a real device, `App.tsx`'s `triggerSync()` needs a code change: fire *both* the Mediboard sync (when linked) *and* a POST to a configured bridge URL, rather than treating them as mutually exclusive alternatives. This has not been built yet — flagging it explicitly here so it isn't silently assumed to be finished.

### 8.4 Deployment status

- Bridge code: written, locally tested (verified against a hand-built sample payload — correctly computed 5 beds, 2 occupied, 1 admit/discharge/deceased/lama each). **Not yet deployed to the Pi.**
- ESP32 sketch: written, not yet flashed/wired to real hardware.
- The `triggerSync()` dual-path fix (§8.3) is not yet built.

---

## 9. Local Database Backup (Postgres, on the Pi)

A small addition, built 2026-09-09: a Postgres database running on the same Raspberry Pi, mirroring the kiosk's local state as a **durable backup — not a replacement for localStorage, and not the app's primary data source.** The React app still reads and writes `localStorage` directly and works fully offline exactly as before; nothing about the existing frontend's behavior changed.

### 9.1 Why

Earlier in this project's history, wiping `~/.config/bedlog-chromium` (the kiosk's Chromium profile — which has genuinely happened on real hardware during deployment troubleshooting) destroyed *all* local BedLog data with nothing to recover from. There was no backup layer of any kind beyond that one browser profile directory. Postgres, running separately on the same Pi, gives a real backup that survives a wiped or corrupted browser profile.

### 9.2 Architecture

```
React app (browser) --localStorage--> unchanged, still the primary read/write path
                    --POST /api/backup (fire-and-forget)--> db-backend/server.cjs (Node) --> Postgres
```

- **`db-backend/schema.sql`** — 5 tables: `device_config`, `wards`, `beds`, `patients` (mirroring `types.ts` exactly), plus `backup_log` — an append-only audit trail of every backup attempt, a real upgrade over `bl_last_sync`'s single overwritten value in localStorage.
- **`db-backend/server.cjs`** — a small Node HTTP service (own `package.json`, one dependency: `pg`). `POST /api/backup` takes a full `{config, beds, patients}` snapshot and does a transactional delete-then-reinsert of wards/beds/patients plus an upsert of `device_config` — matching the same idempotent-full-state philosophy already used in `lib/mediboard.ts`'s own sync design, rather than diffing deltas. `GET /api/backup/:deviceId` reconstructs a snapshot in the exact shape the app uses locally (for future recovery tooling). `GET /health`.
- **`src/app/lib/dbBackup.ts`** — a tiny fire-and-forget `backupState(config, beds, patients)` helper; any failure is caught and silently ignored, never surfaced to kiosk staff.
- **`App.tsx`** — exactly one new `useEffect`, added alongside the three existing persist-to-localStorage effects, calling `backupState` on every `config`/`beds`/`patients` change. This is the only change to the existing frontend code.

### 9.3 Verified

Tested locally end-to-end before handoff (not just written): installed Postgres, loaded the schema, ran the real server, POSTed real request-shaped payloads. Confirmed a snapshot writes correctly across all tables in one transaction, and — the core assumption the whole design rests on — that a second snapshot (simulating a discharge) **replaces cleanly with no duplicate rows**, correctly updating the same patient record in place.

### 9.4 Deployment status

**Not yet deployed to the Pi.** Code is written and locally verified only. To deploy: install PostgreSQL on the Pi, create a `bedlog` database/user, load `schema.sql`, `rsync` the `db-backend/` directory over, `npm install` there, and add a `bedlog-db.service` systemd unit (same pattern as `bedlog-server`/`bedlog-kiosk`/`bedlog-esp-bridge`) with `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` set as environment variables. Then redeploy the frontend build so the new backup call ships. Exact commands were given in-session; not yet copied into the Kiosk Deploy Runbook artifact as of this writing.

### 9.5 Changes on 2026-09-16 (re-verified against Postgres 16)

Found while adding awaiting-bed admissions, and fixed:

- **Every backup for an onboarded device had been failing since 2026-09-14.** `Ward.bedCount` was renamed to `Ward.capacity` in `types.ts` that day, but `server.cjs` still inserted `w.bedCount` into a NOT NULL `bed_count` column. The column is now `capacity` (with a default) and the insert reads `capacity`, falling back to `bedCount` for a pre-rename localStorage.
- **`patients.bed_id` is nullable**, because a patient admitted from app-client to the ward without a bed has none until a nurse assigns it. `server_admission_id` and `name` are stored alongside so the awaiting-bed record survives a restore.
- **Overlapping snapshots are safe.** The kiosk posts on every state change, and one admission changes beds and patients in two React updates, so two snapshots can be in flight at once. Before, the second one's inserts hit duplicate keys and the newer state was lost. Now each transaction takes a per-device advisory lock, and the kiosk sends `snapshotAt` (its clock when it built the payload); a snapshot older than the one stored is skipped (`outcome: "stale"` in the response, still 200). Payloads without `snapshotAt` are stored as "now".
- **Failures are logged.** A failed snapshot writes a `success = false` row with the error to `backup_log`, outside the rolled-back transaction. Stale skips are not logged (nothing was attempted).
- **The service no longer dies on an idle-connection error** (`pool.on("error")`), and a request whose body is cut short no longer hangs.

`schema.sql` now ends with idempotent upgrade statements, so loading it on top of a database created from the 2026-09-09 file migrates it in place; it is safe to re-run on any version. Verified locally in Docker (Postgres 16): fresh load, old-then-new upgrade, re-run, and an end-to-end script covering a snapshot with an awaiting-bed patient, read-back equality, a second snapshot replacing without duplicates, a stale snapshot being skipped, twenty concurrent posts all succeeding with the newest winning, a bad payload rejected without clobbering the last good snapshot, and both outcomes appearing in `backup_log`.

Still true: the app has no restore path yet. `GET /api/backup/:deviceId` returns the snapshot in the app's own shape, so a restore is "write these three keys into localStorage", but no UI or script does that.

---

## 10. Where Deferred-Feature Design Detail Actually Lives

This document summarizes the deferred features (§2.4) enough to know they exist and roughly what they'd involve. The **full, already-worked-out design detail** (so nothing has to be re-derived from scratch when picked back up) lives in this project's Claude Code memory files, at `~/.claude/projects/-Users-prodigydan-Downloads-BedLog-bedicons-v1/memory/`:

- `mediboard_open_questions.md` — the complete, dated history of every Mediboard API question, bug, and resolution (much larger than §5/§6 above, which are condensed summaries).
- `bedlog_no_destructive_ops.md` — the standing "no destructive capability" design principle.
- `bedlog_reload_button_idea.md` — full design for the Settings "Reload" feature.
- `bedlog_reset_device_idea.md` — full design for the "Reset This Device" feature.
- `bedlog_security_code_auth_design.md` — full design for the per-ward API-key onboarding gate, plus its three open blocking questions.

A future Claude Code session working in this project directory will have these available automatically as memory; a human developer without Claude Code access should ask for these files to be exported/shared alongside this document if picking up any of the deferred work.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Ward** | A hospital unit (e.g. "Oncology," "Engine") — the scope one BedLog device is bound to. Structure (name/code/bed count/floor) is owned entirely by Mediboard. |
| **Bed** | One physical bed slot within a ward; has a status and optionally a current patient. |
| **LAMA** | "Left Against Medical Advice" — a discharge outcome type. |
| **Absconded** | A discharge outcome type — patient left without authorization/notice. |
| **Mediboard** | The external, hospital-wide backend system BedLog syncs to; source of truth for ward structure. |
| **hospitalId / wardId** | Mediboard-issued identifiers; presence of both (plus at least one ward) is what makes a device "Mediboard-linked" / considered onboarded. |
| **deviceId** | BedLog's own stable per-install identity; either locally generated or (once linked) issued by Mediboard's `/setup` endpoint. |
| **Kiosk** | The physical Raspberry Pi + touchscreen unit running BedLog fullscreen, unattended. |
| **cage** | The minimal Wayland compositor used to run Chromium fullscreen on the kiosk, replacing an earlier, buggier full-desktop-session approach. |

---

*This document and the Kiosk Deploy Runbook artifact together are intended to be a complete handoff package — a developer or a fresh Claude Code session should be able to work in this codebase productively from these two documents alone, without needing to re-discover anything already documented here.*
