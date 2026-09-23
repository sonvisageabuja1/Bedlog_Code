-- BedLog local backup database — schema.
--
-- This is a durable MIRROR of the kiosk's local state, not a replacement
-- data source: the React app still reads/writes localStorage instantly and
-- works fully offline (see src/app/lib/storage.ts). This database exists so
-- a wiped or corrupted Chromium profile (which has happened on real
-- hardware — see BEDLOG_HANDOFF.md §5.8) doesn't mean total data loss.
--
-- Load with:  psql -U bedlog -d bedlog -f schema.sql

CREATE TABLE IF NOT EXISTS device_config (
  device_id     TEXT PRIMARY KEY,
  hospital_name TEXT NOT NULL DEFAULT '',
  hospital_id   TEXT,
  device_label  TEXT,
  sync_endpoint TEXT,
  sync_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  -- When the kiosk took the snapshot currently stored (its own clock). A
  -- snapshot older than this is ignored, so two overlapping posts can never
  -- leave the OLDER state as the backup.
  snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wards (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES device_config(device_id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL,
  -- Declared capacity from Mediboards (types.ts Ward.capacity). Not the
  -- number of beds; the beds table is the source of truth for that.
  capacity   INTEGER NOT NULL DEFAULT 0,
  floor      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_wards_device ON wards(device_id);

CREATE TABLE IF NOT EXISTS beds (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES device_config(device_id) ON DELETE CASCADE,
  ward_id    TEXT NOT NULL,
  number     TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('available','occupied','cleaning','reserved','maintenance')),
  patient_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beds_device ON beds(device_id);
CREATE INDEX IF NOT EXISTS idx_beds_ward ON beds(ward_id);

-- bed_id/ward_id are deliberately plain indexed columns, not hard foreign
-- keys — a full-snapshot backup (see server.cjs) always replaces wards/beds/
-- patients together in one transaction, so referential integrity holds in
-- practice without needing constraints that could reject an edge-case row
-- (e.g. a historical patient record referencing a bed id that was later
-- regenerated locally) and silently drop data that's still worth keeping.
CREATE TABLE IF NOT EXISTS patients (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES device_config(device_id) ON DELETE CASCADE,
  hospital_number TEXT NOT NULL,
  admitted_at     TIMESTAMPTZ NOT NULL,
  -- NULL while the patient is awaiting a bed: admitted to this ward from
  -- app-client without one, to be assigned by a nurse on the device.
  bed_id          TEXT,
  ward_id         TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('admitted','discharged')),
  -- Mediboard's admissions row id for records adopted from a sync reply,
  -- and the patient's name from Mediboards; both optional.
  server_admission_id TEXT,
  name            TEXT,
  discharge_type  TEXT CHECK (discharge_type IN ('discharged','deceased','lama','absconded','transferred')),
  discharged_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_patients_device ON patients(device_id);
CREATE INDEX IF NOT EXISTS idx_patients_ward ON patients(ward_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_admitted_at ON patients(admitted_at);

-- Append-only, unlike bl_last_sync's single overwritten value in
-- localStorage — this gives a real audit trail of every backup attempt
-- over time, not just the most recent one.
CREATE TABLE IF NOT EXISTS backup_log (
  id        BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES device_config(device_id) ON DELETE CASCADE,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  success   BOOLEAN NOT NULL,
  error     TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_log_device ON backup_log(device_id, at DESC);

-- ---------------------------------------------------------------------------
-- Upgrade for a database created from an earlier version of this file.
-- Safe to re-run; every statement is a no-op once applied.
-- ---------------------------------------------------------------------------
-- 2026-09-16: awaiting-bed admissions (bed_id may be NULL) and the fields
-- that travel with them.
ALTER TABLE patients ALTER COLUMN bed_id DROP NOT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS server_admission_id TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS name TEXT;
-- 2026-09-16: wards.bed_count was renamed to capacity when the app stopped
-- deriving beds from a count (Ward.capacity in types.ts).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'wards' AND column_name = 'bed_count')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'wards' AND column_name = 'capacity') THEN
    ALTER TABLE wards RENAME COLUMN bed_count TO capacity;
  END IF;
END $$;
ALTER TABLE wards ALTER COLUMN capacity SET DEFAULT 0;
ALTER TABLE wards ALTER COLUMN floor SET DEFAULT '';
-- 2026-09-16: stale-snapshot guard.
ALTER TABLE device_config ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now();
