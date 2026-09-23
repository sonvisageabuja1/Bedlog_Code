// BedLog local backup service — receives a full state snapshot from the
// kiosk app (config + wards + beds + patients) and mirrors it into
// Postgres. This is a DURABLE BACKUP, not the app's primary data source —
// the React app keeps reading/writing localStorage directly and works
// fully offline regardless of whether this service or Postgres is up.
//
// Env vars (standard libpq/node-postgres names — set in the systemd unit,
// not hardcoded here): PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD.
// PORT (this HTTP server's own port) defaults to 4002.
//
// Run with: node server.cjs

const http = require("http");
const { Pool } = require("pg");

const PORT = process.env.PORT || 4002;
const pool = new Pool(); // reads PG* env vars automatically

// An idle client can drop its connection (Postgres restarted, network
// blip). Without a listener node-postgres re-throws that as an uncaught
// error and the whole service dies; with one it just logs and the next
// request checks out a fresh client.
pool.on("error", (e) => {
  console.error("pg pool error:", e.message);
});

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) req.destroy(); // guard against a runaway body
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
    // A body cut short (client gone, or destroyed by the guard above)
    // never fires "end"; without this the request would hang forever.
    req.on("close", () => reject(new Error("request body incomplete")));
  });
}

// Records a failed attempt in backup_log, outside the failed transaction
// (which has been rolled back). Best effort: if Postgres itself is the
// problem this fails too, and the caller's error is the one that matters.
async function logFailure(deviceId, message) {
  try {
    await pool.query(
      `INSERT INTO backup_log (device_id, success, error)
       SELECT $1, false, $2 WHERE EXISTS (SELECT 1 FROM device_config WHERE device_id = $1)`,
      [deviceId, String(message).slice(0, 1000)],
    );
  } catch {
    // ignore
  }
}

// Full-snapshot replace, in one transaction: matches the same
// idempotent-full-state philosophy already used everywhere else in this
// app's own sync code (see lib/mediboard.ts) rather than diffing deltas.
//
// The kiosk posts on EVERY state change, and one admission changes beds
// and patients in two React updates, so two snapshots can be in flight at
// once. Two things keep that safe:
//  - a per-device advisory lock serialises the transactions, so the second
//    one's DELETE always sees the first one's rows (without it the second
//    INSERT hits duplicate keys and the newer snapshot is lost);
//  - snapshotAt (the kiosk's clock when it built the payload) is compared
//    with what is stored, and an older snapshot is skipped, so the order
//    the requests happen to arrive in cannot leave old state as the backup.
// Returns "stored" or "stale".
async function backupSnapshot({ config, beds, patients, snapshotAt }) {
  const takenAt = Number.isFinite(Number(snapshotAt)) && snapshotAt != null
    ? new Date(Number(snapshotAt))
    : new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [config.deviceId]);

    const existing = await client.query(
      "SELECT snapshot_at FROM device_config WHERE device_id = $1",
      [config.deviceId],
    );
    if (existing.rows[0] && existing.rows[0].snapshot_at > takenAt) {
      await client.query("ROLLBACK");
      return "stale";
    }

    await client.query(
      `INSERT INTO device_config (device_id, hospital_name, hospital_id, device_label, sync_endpoint, sync_enabled, snapshot_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (device_id) DO UPDATE SET
         hospital_name = EXCLUDED.hospital_name,
         hospital_id   = EXCLUDED.hospital_id,
         device_label  = EXCLUDED.device_label,
         sync_endpoint = EXCLUDED.sync_endpoint,
         sync_enabled  = EXCLUDED.sync_enabled,
         snapshot_at   = EXCLUDED.snapshot_at,
         updated_at    = now()`,
      [
        config.deviceId,
        config.hospitalName ?? "",
        config.hospitalId ?? null,
        config.deviceLabel ?? null,
        config.syncEndpoint ?? null,
        !!config.syncEnabled,
        takenAt.toISOString(),
      ],
    );

    // Delete-then-reinsert children — the payload is always the FULL
    // current state, so this is simpler and safer than trying to
    // reconcile row-by-row, and it's wrapped in the same transaction so a
    // failure never leaves a half-replaced snapshot.
    await client.query("DELETE FROM patients WHERE device_id = $1", [config.deviceId]);
    await client.query("DELETE FROM beds WHERE device_id = $1", [config.deviceId]);
    await client.query("DELETE FROM wards WHERE device_id = $1", [config.deviceId]);

    for (const w of config.wards || []) {
      await client.query(
        `INSERT INTO wards (id, device_id, name, code, capacity, floor) VALUES ($1,$2,$3,$4,$5,$6)`,
        // capacity replaced bedCount in types.ts on 2026-09-14; the old
        // name is read as a fallback so a pre-rename localStorage still
        // backs up.
        [w.id, config.deviceId, w.name, w.code ?? "", Number(w.capacity ?? w.bedCount ?? 0), w.floor ?? ""],
      );
    }

    for (const b of beds || []) {
      await client.query(
        `INSERT INTO beds (id, device_id, ward_id, number, status, patient_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7 / 1000.0))`,
        [b.id, config.deviceId, b.wardId, b.number, b.status, b.patientId ?? null, b.updatedAt],
      );
    }

    for (const p of patients || []) {
      await client.query(
        `INSERT INTO patients (id, device_id, hospital_number, admitted_at, bed_id, ward_id, status, discharge_type, discharged_at, server_admission_id, name)
         VALUES ($1,$2,$3,to_timestamp($4 / 1000.0),$5,$6,$7,$8,
                 CASE WHEN $9::bigint IS NULL THEN NULL ELSE to_timestamp($9 / 1000.0) END,
                 $10,$11)`,
        [
          p.id,
          config.deviceId,
          p.hospitalNumber,
          p.admittedAt,
          p.bedId ?? null, // null while awaiting a bed
          p.wardId,
          p.status,
          p.dischargeType ?? null,
          p.dischargedAt ?? null,
          p.serverAdmissionId ?? null,
          p.name ?? null,
        ],
      );
    }

    await client.query(
      `INSERT INTO backup_log (device_id, success) VALUES ($1, true)`,
      [config.deviceId],
    );

    await client.query("COMMIT");
    return "stored";
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection already gone; nothing to roll back
    }
    throw e;
  } finally {
    client.release();
  }
}

// Reconstructs a full snapshot in the same shape the app itself uses
// locally — for future recovery tooling (e.g. a "restore from backup"
// path if a device's local profile is ever wiped again).
async function readSnapshot(deviceId) {
  const cfg = await pool.query("SELECT * FROM device_config WHERE device_id = $1", [deviceId]);
  if (cfg.rows.length === 0) return null;
  const wards = await pool.query("SELECT * FROM wards WHERE device_id = $1", [deviceId]);
  const beds = await pool.query("SELECT * FROM beds WHERE device_id = $1", [deviceId]);
  const patients = await pool.query("SELECT * FROM patients WHERE device_id = $1", [deviceId]);

  const c = cfg.rows[0];
  return {
    config: {
      deviceId: c.device_id,
      hospitalName: c.hospital_name,
      hospitalId: c.hospital_id ?? undefined,
      deviceLabel: c.device_label ?? undefined,
      syncEndpoint: c.sync_endpoint ?? undefined,
      syncEnabled: c.sync_enabled,
      wards: wards.rows.map((w) => ({
        id: w.id, name: w.name, code: w.code, capacity: w.capacity, floor: w.floor,
      })),
    },
    beds: beds.rows.map((b) => ({
      id: b.id, wardId: b.ward_id, number: b.number, status: b.status,
      patientId: b.patient_id ?? undefined, updatedAt: b.updated_at.getTime(),
    })),
    patients: patients.rows.map((p) => ({
      id: p.id, hospitalNumber: p.hospital_number, admittedAt: p.admitted_at.getTime(),
      bedId: p.bed_id ?? null, wardId: p.ward_id, status: p.status,
      dischargeType: p.discharge_type ?? undefined,
      dischargedAt: p.discharged_at ? p.discharged_at.getTime() : undefined,
      serverAdmissionId: p.server_admission_id ?? undefined,
      name: p.name ?? undefined,
    })),
  };
}

const server = http.createServer(async (req, res) => {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    try {
      await pool.query("SELECT 1");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/backup") {
    let body = {};
    try {
      body = await readJsonBody(req);
      if (!body || !body.config || !body.config.deviceId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "missing config.deviceId" }));
        return;
      }
      const outcome = await backupSnapshot(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, outcome }));
    } catch (e) {
      console.error("backup failed:", e);
      if (body && body.config && body.config.deviceId) {
        await logFailure(body.config.deviceId, e.message);
      }
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/backup/")) {
    const deviceId = decodeURIComponent(req.url.slice("/api/backup/".length));
    try {
      const snapshot = await readSnapshot(deviceId);
      if (!snapshot) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "no backup found for this deviceId" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(snapshot));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`bedlog db-backend listening on port ${PORT}`);
});
