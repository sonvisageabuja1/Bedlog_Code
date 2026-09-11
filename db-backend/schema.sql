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
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wards (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES device_config(device_id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL,
  bed_count  INTEGER NOT NULL,
  floor      TEXT NOT NULL
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
  bed_id          TEXT NOT NULL,
  ward_id         TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('admitted','discharged')),
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
