export const TZ = "Europe/Paris";

export function ageFromBirthDate(birth: string, now = new Date()): number {
  const [y, m, d] = birth.split("-").map(Number);
  let age = now.getFullYear() - y;
  const mm = now.getMonth() + 1;
  if (mm < m || (mm === m && now.getDate() < d)) age--;
  return age;
}

export function formatWhen(date: Date | string | null | undefined, opts: { withTime?: boolean } = { withTime: true }) {
  if (!date) return "Dès que possible";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const fmtDay = (x: Date) => x.toLocaleDateString("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const tomorrow = new Date(now.getTime() + 86400000);
  let day: string;
  if (fmtDay(d) === fmtDay(now)) day = "Aujourd'hui";
  else if (fmtDay(d) === fmtDay(tomorrow)) day = "Demain";
  else day = d.toLocaleDateString("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
  if (!opts.withTime) return day;
  const time = d.toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
  return `${day} · ${time}`;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { timeZone: TZ, day: "numeric", month: "short" });
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Heure locale (Paris) d'une date : jour de semaine 0=lundi…6=dimanche et minute du jour. */
export function parisWeekMinute(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return { weekday: idx, minute: hour * 60 + minute };
}
