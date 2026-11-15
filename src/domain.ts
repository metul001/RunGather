import type { Event } from "./types";
export const DIVISIONS = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
];
export function dhakaDate(value: Date | string = new Date()): string {
  const d = new Date(value);
  return new Date(d.getTime() + 6 * 3600000).toISOString().slice(0, 10);
}
export function shiftDate(key: string, days: number): string {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monthDays(key: string): (string | null)[] {
  const first = key.slice(0, 7) + "-01";
  const d = new Date(first + "T12:00:00Z");
  const days = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const result: (string | null)[] = Array(d.getUTCDay()).fill(null);
  for (let i = 0; i < days; i++) result.push(shiftDate(first, i));
  while (result.length % 7) result.push(null);
  return result;
}
export function weekDays(key: string): string[] {
  const weekday = new Date(key + "T12:00:00Z").getUTCDay();
  return Array.from({ length: 7 }, (_, i) => shiftDate(key, i - weekday));
}
export function moveMonth(key: string, delta: number): string {
  const d = new Date(key.slice(0, 7) + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}
export function ratingLabel(
  score: number | null | undefined,
  count: number = 0,
) {
  return score == null || count === 0
    ? "Not yet rated"
    : `★ ${Number(score).toFixed(1)}/10 · ${count} review${count === 1 ? "" : "s"}`;
}
export function httpsUrl(value: string): string {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("Use an HTTPS link without embedded credentials.");
  return u.href;
}
export interface Filters {
  query: string;
  division: number | null;
  district: number | null;
  category: number | null;
  period: string;
  price: string;
  sort: string;
  date?: string;
}
export const defaultFilters: Filters = {
  query: "",
  division: null,
  district: null,
  category: null,
  period: "upcoming",
  price: "all",
  sort: "date",
};
export function filterEvents(
  events: Event[],
  f: Filters,
  now = new Date(),
): Event[] {
  const day = dhakaDate(now);
  const week = weekDays(day);
  return events
    .filter((e) => {
      const date = dhakaDate(e.starts_at);
      const haystack = [
        e.name,
        e.organizer_name,
        e.category_name,
        e.division_name,
        e.district_name,
        e.venue,
        date,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!f.query || haystack.includes(f.query.trim().toLowerCase())) &&
        (!f.division || e.division_id === f.division) &&
        (!f.district || e.district_id === f.district) &&
        (!f.category || e.category_id === f.category) &&
        (!f.date || date === f.date) &&
        (f.price === "all" ||
          (f.price === "free" ? Number(e.price) === 0 : Number(e.price) > 0)) &&
        (f.period === "all" ||
          (f.period === "upcoming"
            ? new Date(e.ends_at) > now && !e.cancelled
            : f.period === "today"
              ? date === day
              : f.period === "week"
                ? week.includes(date)
                : date.slice(0, 7) === day.slice(0, 7)))
      );
    })
    .sort((a, b) =>
      f.sort === "rating"
        ? Number(b.average_rating ?? -1) - Number(a.average_rating ?? -1) ||
          a.starts_at.localeCompare(b.starts_at)
        : f.sort === "popularity"
          ? Number(b.popularity) - Number(a.popularity) ||
            a.starts_at.localeCompare(b.starts_at)
          : a.starts_at.localeCompare(b.starts_at),
    );
}
export function countsByDate(events: Event[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (!e.cancelled) {
      const day = dhakaDate(e.starts_at);
      counts[day] = (counts[day] || 0) + 1;
    }
  }
  return counts;
}
export function localInputToISO(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw Error("Use YYYY-MM-DD and HH:MM.");
  const d = new Date(`${date}T${time}:00+06:00`);
  if (
    !Number.isFinite(d.getTime()) ||
    dhakaDate(d) !== date ||
    new Date(d.getTime() + 6 * 3600000).toISOString().slice(11, 16) !== time
  )
    throw Error("Invalid date or time.");
  return d.toISOString();
}
