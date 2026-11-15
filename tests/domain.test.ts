import test from "node:test";
import assert from "node:assert/strict";
import {
  dhakaDate,
  monthDays,
  weekDays,
  moveMonth,
  localInputToISO,
  httpsUrl,
  ratingLabel,
  filterEvents,
  countsByDate,
  defaultFilters,
  DIVISIONS,
} from "../src/domain";
import { Event } from "../src/types";
const event = (overrides: Partial<Event> = {}): Event => ({
  transport_status: "unknown",
  transport_details: "",
  transport_url: null,
  id: "1",
  organizer_id: "org",
  name: "Dhaka Run",
  description: "Running event",
  category_id: 1,
  division_id: 1,
  district_id: 1,
  starts_at: "2027-01-01T00:00:00Z",
  ends_at: "2027-01-01T05:00:00Z",
  registration_deadline: "2026-12-30T00:00:00Z",
  venue: "Park",
  address: "Dhaka",
  map_url: null,
  cover_path: null,
  contact: "test",
  price: 0,
  registration_url: null,
  approval: "approved",
  cancelled: false,
  organizer_name: "Runner Club",
  organizer_verified: false,
  average_rating: null,
  review_count: 0,
  division_name: "Dhaka",
  district_name: "Dhaka",
  category_name: "Running",
  status: "upcoming",
  popularity: 0,
  ...overrides,
});
test("Bangladesh calendar midnight, leap year and week boundaries", () => {
  assert.equal(dhakaDate("2026-11-14T19:00:00Z"), "2026-11-15");
  assert.equal(monthDays("2028-02-10").filter(Boolean).length, 29);
  assert.equal(monthDays("2027-02-10").filter(Boolean).length, 28);
  assert.deepEqual(weekDays("2027-01-01"), [
    "2026-12-27",
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
  assert.equal(moveMonth("2026-12-31", 1), "2027-01-01");
});
test("Timezone conversion rejects invalid date/time", () => {
  assert.equal(
    localInputToISO("2027-01-01", "06:00"),
    "2027-01-01T00:00:00.000Z",
  );
  assert.throws(() => localInputToISO("2027-02-30", "06:00"));
  assert.throws(() => localInputToISO("2027-01-01", "26:00"));
});
test("No invented ratings; secure links only", () => {
  assert.equal(ratingLabel(null, 0), "Not yet rated");
  assert.equal(ratingLabel(8.66, 3), "★ 8.7/10 · 3 reviews");
  assert.throws(() => httpsUrl("javascript:alert(1)"));
  assert.throws(() => httpsUrl("https://user:pass@example.com"));
  assert.equal(httpsUrl("https://example.com"), "https://example.com/");
});
test("All eight divisions, districts, category, search and date filtering", () => {
  const events = DIVISIONS.map((name, i) =>
    event({
      id: String(i),
      division_id: i + 1,
      division_name: name,
      district_id: i + 1,
    }),
  );
  for (let i = 1; i <= 8; i++)
    assert.equal(
      filterEvents(events, { ...defaultFilters, period: "all", division: i })
        .length,
      1,
    );
  assert.equal(
    filterEvents(events, { ...defaultFilters, period: "all", district: 3 })
      .length,
    1,
  );
  assert.equal(
    filterEvents(events, { ...defaultFilters, period: "all", category: 2 })
      .length,
    0,
  );
  assert.equal(
    filterEvents(events, {
      ...defaultFilters,
      period: "all",
      query: "Runner Club",
    }).length,
    8,
  );
  assert.equal(
    filterEvents(events, {
      ...defaultFilters,
      period: "all",
      date: "2027-01-02",
    }).length,
    0,
  );
});
test("Calendar counts exclude cancellations; ordering and prices", () => {
  const a = event(),
    b = event({
      id: "2",
      price: 500,
      average_rating: 9,
      review_count: 1,
      popularity: 4,
    }),
    c = event({ id: "3", cancelled: true });
  assert.equal(countsByDate([a, b, c])["2027-01-01"], 2);
  assert.equal(
    filterEvents([a, b], { ...defaultFilters, period: "all", price: "paid" })[0]
      .id,
    "2",
  );
  assert.equal(
    filterEvents([a, b], {
      ...defaultFilters,
      period: "all",
      sort: "rating",
    })[0].id,
    "2",
  );
  assert.equal(
    filterEvents([a, b], {
      ...defaultFilters,
      period: "all",
      sort: "popularity",
    })[0].id,
    "2",
  );
});
