import { DISCHARGE_TTL } from "../constants";

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function stayHours(ts: number): string {
  const h = Math.floor((Date.now() - ts) / 3_600_000);
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function countdown(ts: number): string {
  const rem = Math.ceil(
    (DISCHARGE_TTL - (Date.now() - ts)) / 60_000,
  );
  return rem > 0 ? `${rem}m left` : "removing...";
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `about ${mins} minutes ago`;
  if (hours < 2) return "about 1 hour ago";
  if (hours < 24) return `about ${hours} hours ago`;
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
