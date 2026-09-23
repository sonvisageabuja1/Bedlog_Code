// Tiny bridge between BedLog's browser-side "Data Sync" feature and the
// ESP32 display. BedLog has no backend of its own — all ward/bed/patient
// data lives in the browser's storage — so this receives the same payload
// BedLog already builds for sync (see src/app/lib/sync.ts buildSyncPayload)
// and exposes a small summary the ESP32 can poll with a plain HTTP GET.
//
// Run with: node server.js
// Listens on port 4001 by default (override with PORT env var).

const http = require("http");

const PORT = process.env.PORT || 4001;

let latestPayload = null;

function isToday(timestamp) {
  if (!timestamp) return false;
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function computeDisplay(payload) {
  const beds = payload.beds || [];
  const patients = payload.patients || [];
  const ward = (payload.wards || [])[0];

  let admit = 0;
  let discharge = 0;
  let deceased = 0;
  let lama = 0;
  let abscond = 0;

  for (const p of patients) {
    if (isToday(p.admittedAt)) admit++;
    if (p.status === "discharged" && isToday(p.dischargedAt)) {
      switch (p.dischargeType) {
        case "discharged":
          discharge++;
          break;
        case "deceased":
          deceased++;
          break;
        case "lama":
          lama++;
          break;
        case "absconded":
          abscond++;
          break;
        // "transferred" intentionally not shown on the display
      }
    }
  }

  return {
    ward: ward ? ward.name : payload.hospitalName || "Unknown",
    totalBeds: beds.length,
    occupied: beds.filter((b) => b.status === "occupied").length,
    available: beds.filter((b) => b.status === "available").length,
    admit,
    discharge,
    deceased,
    lama,
    abscond,
    updatedAt: payload.generatedAt || new Date().toISOString(),
  };
}

function withCors(res) {
  // BedLog runs in the browser on its own origin (http://localhost:5173);
  // this bridge is a different port, so the browser's fetch needs an
  // explicit CORS allow — everything here stays on the local network, so
  // a wide-open allow is fine.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer((req, res) => {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/ingest") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // guard against a runaway/garbage request body
      if (body.length > 5_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        latestPayload = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid JSON" }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/display") {
    if (!latestPayload) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no data received yet" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(computeDisplay(latestPayload)));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`esp-bridge listening on port ${PORT}`);
});
