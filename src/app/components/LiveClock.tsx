import { useEffect, useState } from "react";

// ─── LIVE CLOCK ───────────────────────────────────────────────────────────────

export function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const days = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const d = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
  const t = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-2 font-semibold text-[#011a57] text-[14px] leading-[24px] shrink-0">
      <span>{d}</span>
      <span>{t}</span>
    </div>
  );
}
