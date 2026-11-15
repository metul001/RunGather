import type { Event } from "./types";
export type OfflineEvent = Pick<
  Event,
  | "id"
  | "name"
  | "organizer_name"
  | "description"
  | "starts_at"
  | "ends_at"
  | "venue"
  | "address"
  | "contact"
  | "division_name"
  | "district_name"
  | "cancelled"
  | "transport_details"
>;
export type SavedSnapshot = {
  version: 1;
  userId: string;
  syncedAt: number;
  events: OfflineEvent[];
};
export const MAX_OFFLINE = 20,
  OFFLINE_TTL = 7 * 86400000;
export interface CacheStorage {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
}
const uidPattern = /^[a-f0-9-]{36}$/i;
function base(user: string) {
  if (!uidPattern.test(user)) throw Error("Invalid cache account");
  return "saved-v1-" + user;
}
export function snapshotFor(
  userId: string,
  events: Event[],
  now = Date.now(),
): SavedSnapshot {
  base(userId);
  return {
    version: 1,
    userId,
    syncedAt: now,
    events: events.slice(0, MAX_OFFLINE).map((e) => ({
      id: e.id,
      name: e.name.slice(0, 120),
      organizer_name: e.organizer_name.slice(0, 100),
      description: e.description.slice(0, 1500),
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      venue: e.venue.slice(0, 180),
      address: e.address.slice(0, 500),
      contact: e.contact.slice(0, 200),
      division_name: e.division_name,
      district_name: e.district_name,
      cancelled: e.cancelled,
      transport_details: e.transport_details.slice(0, 800),
    })),
  };
}
export function parseSnapshot(
  raw: string,
  user: string,
  now = Date.now(),
): SavedSnapshot | null {
  try {
    if (raw.length > 64000) return null;
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      s.userId !== user ||
      !Number.isFinite(s.syncedAt) ||
      s.syncedAt > now + 60000 ||
      now - s.syncedAt > OFFLINE_TTL ||
      !Array.isArray(s.events) ||
      s.events.length > MAX_OFFLINE
    )
      return null;
    for (const e of s.events) {
      if (!e || !uidPattern.test(e.id) || typeof e.cancelled !== "boolean")
        return null;
      for (const k of [
        "name",
        "organizer_name",
        "description",
        "starts_at",
        "ends_at",
        "venue",
        "address",
        "contact",
        "division_name",
        "district_name",
        "transport_details",
      ])
        if (typeof e[k] !== "string" || e[k].length > 2000) return null;
      if (
        !Number.isFinite(Date.parse(e.starts_at)) ||
        !Number.isFinite(Date.parse(e.ends_at))
      )
        return null;
    }
    return s;
  } catch {
    return null;
  }
}
// Alternating slots keep the old complete copy until the new manifest is committed.
export function createOfflineCache(storage: CacheStorage) {
  let queue = Promise.resolve();
  function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn, fn);
    queue = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  async function manifest(
    key: string,
  ): Promise<{ slot: number; count: number } | null> {
    try {
      const m = JSON.parse((await storage.getItem(key)) ?? "null");
      return m &&
        [0, 1].includes(m.slot) &&
        Number.isInteger(m.count) &&
        m.count > 0 &&
        m.count <= 160
        ? m
        : null;
    } catch {
      return null;
    }
  }
  return {
    load: (user: string) =>
      run(async () => {
        const key = base(user),
          m = await manifest(key);
        if (!m) return null;
        let raw = "";
        for (let i = 0; i < m.count; i++) {
          const chunk = await storage.getItem(`${key}.${m.slot}.${i}`);
          if (chunk === null) return null;
          raw += chunk;
        }
        return parseSnapshot(raw, user);
      }),
    save: (user: string, events: Event[]) =>
      run(async () => {
        const key = base(user),
          old = await manifest(key),
          slot = old?.slot === 0 ? 1 : 0,
          snapshot = snapshotFor(user, events),
          initial = JSON.stringify(snapshot);
        let raw = initial;
        while (raw.length > 64000 && snapshot.events.length) {
          snapshot.events.pop();
          raw = JSON.stringify(snapshot);
        }
        if (raw.length > 64000) throw Error("Offline copy too large");
        const points = Array.from(raw);
        const count = Math.ceil(points.length / 400);
        for (let i = 0; i < count; i++)
          await storage.setItem(
            `${key}.${slot}.${i}`,
            points.slice(i * 400, (i + 1) * 400).join(""),
          );
        await storage.setItem(key, JSON.stringify({ slot, count }));
        if (old)
          for (let i = 0; i < old.count; i++)
            await storage.removeItem(`${key}.${old.slot}.${i}`);
        return snapshot;
      }),
    clear: (user: string) =>
      run(async () => {
        const key = base(user);
        await storage.removeItem(key);
        for (let slot = 0; slot < 2; slot++)
          for (let i = 0; i < 160; i++)
            await storage.removeItem(`${key}.${slot}.${i}`);
      }),
  };
}
