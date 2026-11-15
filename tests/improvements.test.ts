import { test } from "node:test";
import assert from "node:assert/strict";
import { translate, localeFor, bangla } from "../src/translations";
import {
  recordMetric,
  metricsSummary,
  clearMetrics,
  apiCategory,
  measured,
} from "../src/performance";
import {
  createOfflineCache,
  parseSnapshot,
  snapshotFor,
  OFFLINE_TTL,
} from "../src/offline";
import type { Event } from "../src/types";
const user = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002";
const event = {
  id: other,
  name: "ঢাকা দৌড়",
  organizer_name: "Runners",
  description: "একটি দৌড়ের ইভেন্ট",
  starts_at: "2027-01-01T06:00:00+06:00",
  ends_at: "2027-01-01T10:00:00+06:00",
  venue: "Park",
  address: "Dhaka",
  contact: "Public contact",
  division_name: "Dhaka",
  district_name: "Dhaka",
  cancelled: false,
  transport_details: "Pickup 5am",
  secret: "not cached",
} as unknown as Event;
test("Bangla UI dictionary preserves unknown content and English fallback", () => {
  assert.equal(translate("Home", "bn"), "হোম");
  assert.equal(translate("Reserve seats", "bn"), "আসন বুক করুন");
  assert.equal(
    translate("A real organizer name", "bn"),
    "A real organizer name",
  );
  assert.equal(translate("Home", "en"), "Home");
  assert.equal(localeFor("bn"), "bn-BD");
  assert(Object.keys(bangla).length > 100);
});
test("Performance metrics are bounded, sanitized and compute nearest-rank percentiles", async () => {
  clearMetrics();
  for (let i = 1; i <= 101; i++) recordMetric("api.read", i, i !== 101);
  recordMetric("api.read", NaN);
  recordMetric("api.read", -1);
  assert.deepEqual(metricsSummary()[0], {
    name: "api.read",
    count: 100,
    failed: 1,
    p50: 51,
    p95: 96,
  });
  assert.equal(
    apiCategory("https://secret.example/rest/v1/profiles?token=secret"),
    "api.read",
  );
  assert.equal(apiCategory("https://x/auth/v1/token", "POST"), "api.auth");
  assert.equal(apiCategory("invalid?secret"), "api.other");
  await assert.rejects(() =>
    measured("search", async () => {
      throw Error("private-content");
    }),
  );
  assert(!JSON.stringify(metricsSummary()).includes("private-content"));
  assert(!JSON.stringify(metricsSummary()).includes("secret"));
  clearMetrics();
  assert.deepEqual(metricsSummary(), []);
});
test("Offline snapshots reject expired, corrupt and cross-account data", () => {
  const now = Date.now(),
    snapshot = snapshotFor(user, [event], now),
    raw = JSON.stringify(snapshot);
  assert(parseSnapshot(raw, user, now));
  assert.equal(parseSnapshot(raw, other, now), null);
  assert.equal(parseSnapshot(raw, user, now + OFFLINE_TTL + 1), null);
  assert.equal(parseSnapshot("{", user), null);
  assert.equal(
    parseSnapshot(
      JSON.stringify({
        ...snapshot,
        events: [{ ...snapshot.events[0], starts_at: "bad" }],
      }),
      user,
      now,
    ),
    null,
  );
  assert(!raw.includes("not cached"));
  assert.equal(snapshotFor(user, Array(30).fill(event)).events.length, 20);
});
test("Offline chunk storage commits complete copies and clears account isolation", async () => {
  const data = new Map<string, string>();
  const cache = createOfflineCache({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  });
  await cache.save(user, [event]);
  assert.equal((await cache.load(user))?.events[0].name, event.name);
  assert.equal(await cache.load(other), null);
  await cache.save(user, [{ ...event, name: "New snapshot" }]);
  assert.equal((await cache.load(user))?.events[0].name, "New snapshot");
  const chunk = [...data.keys()].find((k) => k.endsWith(".0"));
  assert(chunk);
  data.delete(chunk!);
  assert.equal(await cache.load(user), null);
  await cache.clear(user);
  assert.equal(await cache.load(user), null);
  assert.equal(data.size, 0);
});

test("Interrupted offline writes retain the last complete snapshot", async () => {
  const data = new Map<string, string>();
  let fail = false;
  const cache = createOfflineCache({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      if (fail && k.includes(".1.")) throw Error("Keychain full");
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  });
  await cache.save(user, [event]);
  fail = true;
  await assert.rejects(() =>
    cache.save(user, [{ ...event, name: "Should not commit" }]),
  );
  assert.equal((await cache.load(user))?.events[0].name, event.name);
});
test("Offline chunks preserve emoji across storage boundaries and cap large snapshots", async () => {
  const data = new Map<string, string>();
  const cache = createOfflineCache({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      assert(!/[\uD800-\uDBFF]$/.test(v));
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  });
  const full = {
    ...event,
    description: "🏃".repeat(750),
    transport_details: "B".repeat(800),
    address: "C".repeat(500),
  };
  await cache.save(user, Array(20).fill(full));
  const saved = await cache.load(user);
  assert(saved);
  assert(saved.events.length > 0 && saved.events.length <= 20);
  assert.equal(saved.events[0].description, full.description);
});
