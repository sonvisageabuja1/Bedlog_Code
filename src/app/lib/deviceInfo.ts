// This Pi's network addresses, read from the local backup service (see
// db-backend/server.cjs): a page in the browser can't see its own IP.
// Resolves null when the service isn't reachable (e.g. in dev on a laptop).
const DEVICE_INFO_URL = "http://localhost:4002/api/device-info";

export type DeviceAddress = { iface: string; address: string };

export async function fetchDeviceAddresses(): Promise<DeviceAddress[] | null> {
  try {
    const res = await fetch(DEVICE_INFO_URL, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { addresses?: DeviceAddress[] };
    return Array.isArray(body.addresses) ? body.addresses : null;
  } catch {
    return null;
  }
}
