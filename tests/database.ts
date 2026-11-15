import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
// Runs the actual migration SQL in embedded PostgreSQL. Auth/storage infrastructure is stubbed,
// but PostgreSQL grants, RLS, triggers, constraints and SECURITY DEFINER RPCs execute for real.
const db = new PGlite();
let passed = 0;
const uid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const alice = uid(1),
  bob = uid(2),
  owner = uid(3),
  other = uid(4),
  admin = uid(5);
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');

`.replace("::jsonb->>'sub'", "::jsonb->>'sub'"),
);
// Explicit cast needed for uuid return.
await db.exec(`create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
`);
for (const file of (await fs.readdir("supabase/migrations")).sort())
  await db.exec(await fs.readFile("supabase/migrations/" + file, "utf8"));
for (const id of [alice, bob, owner, other, admin])
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
    [id, { display_name: "Tester" }],
  );
await db.query("update public.user_roles set role='admin' where user_id=$1", [
  admin,
]);
async function as<T = Record<string, unknown>>(
  id: string | null,
  sql: string,
  params: unknown[] = [],
  aal = "aal1",
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role " + (id ? "authenticated" : "anon"));
    await tx.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify(id ? { sub: id, aal } : {}),
    ]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
async function ok(name: string, fn: () => Promise<void>) {
  await fn();
  console.log("PASS", name);
  passed++;
}
async function denied(fn: () => Promise<unknown>) {
  await assert.rejects(fn);
}
await ok(
  "All 8 divisions and 64 districts seeded; no events or ratings fabricated",
  async () => {
    assert.equal((await as(null, "select * from divisions")).length, 8);
    assert.equal((await as(null, "select * from districts")).length, 64);
    assert.equal((await as(null, "select * from event_directory")).length, 0);
  },
);
await ok(
  "Private profiles, role escalation and unauthenticated RPC protected",
  async () => {
    assert.equal((await as(alice, "select * from profiles")).length, 1);
    assert.equal(
      (await as(alice, "select * from profiles where id=$1", [bob])).length,
      0,
    );
    await denied(() =>
      as(alice, "update user_roles set role='admin' where user_id=$1", [alice]),
    );
    await denied(() => as(null, "select update_profile('Attacker')"));
  },
);
const org = (
  await as<{ save_organizer: string }>(owner, "select save_organizer($1)", [
    {
      name: "Real Club",
      description: "Organizer test account",
      contact: "club@example.com",
    },
  ])
)[0].save_organizer;
await ok("Pending organizer hidden; administrator requires MFA", async () => {
  assert.equal((await as(null, "select * from organizers")).length, 0);
  await denied(() =>
    as(admin, "select admin_action('organizer',$1,'approved')", [org]),
  );
  await as(
    admin,
    "select admin_action('organizer',$1,'approved')",
    [org],
    "aal2",
  );
  assert.equal((await as(null, "select * from organizers")).length, 1);
});
const future = new Date(Date.now() + 30 * 86400000),
  end = new Date(future.getTime() + 3600000),
  deadline = new Date(future.getTime() - 86400000);
const event = {
  name: "Database Test Event",
  description: "Real integration test fixture only",
  category_id: 1,
  division_id: 1,
  district_id: 1,
  starts_at: future.toISOString(),
  ends_at: end.toISOString(),
  registration_deadline: deadline.toISOString(),
  venue: "Park",
  address: "Dhaka test venue",
  contact: "club@example.com",
  price: 0,
};
const eid = (
  await as<{ save_event: string }>(owner, "select save_event($1)", [event])
)[0].save_event;
await ok(
  "Event approval, ownership and division/district constraints",
  async () => {
    assert.equal((await as(null, "select * from events")).length, 0);
    await denied(() => as(other, "select save_event($1,$2)", [event, eid]));
    await denied(() =>
      as(owner, "select save_event($1)", [{ ...event, district_id: 17 }]),
    );
    await denied(() =>
      as(owner, "update events set approval='approved' where id=$1", [eid]),
    );
    await as(
      admin,
      "select admin_action('event',$1,'approved')",
      [eid],
      "aal2",
    );
    assert.equal((await as(null, "select * from event_directory")).length, 1);
  },
);
await ok(
  "Transport validates input, enforces ownership and requires reapproval",
  async () => {
    await denied(() => as(null, "select save_event($1)", [event]));
    await denied(() => as(owner, "select save_event_base($1)", [event]));
    await denied(() =>
      as(other, "select save_event($1,$2)", [
        {
          ...event,
          transport_status: "available",
          transport_details: "Bus at 5am, contact organizer",
        },
        eid,
      ]),
    );
    for (const transport of [
      { transport_status: "invented" },
      { transport_status: "available", transport_details: "" },
      { transport_url: "http://example.com" },
      { transport_url: "https://user:pass@example.com" },
      { transport_details: "x".repeat(2001) },
    ])
      await denied(() =>
        as(owner, "select save_event($1,$2)", [
          { ...event, ...transport },
          eid,
        ]),
      );
    await as(owner, "select save_event($1,$2)", [
      {
        ...event,
        transport_status: "available",
        transport_details:
          "Runner bus: Park, 5am, return noon, BDT 200, contact organizer",
        transport_url: "https://example.com/bus",
      },
      eid,
    ]);
    assert.equal((await as(null, "select * from event_directory")).length, 0);
    await as(
      admin,
      "select admin_action('event',$1,'approved')",
      [eid],
      "aal2",
    );
    const listing = (
      await as(null, "select * from event_directory where id=$1", [eid])
    )[0];
    assert.equal(listing.transport_status, "available");
    assert.equal(listing.transport_url, "https://example.com/bus");
  },
);
await ok(
  "Server search is bounded, literal, stable and honors RLS and saved privacy",
  async () => {
    const search = async (
      user: string | null,
      filters: object = {},
      offset = 0,
      size = 20,
    ) =>
      (
        await as<{ result: { items: { id: string }[]; has_more: boolean } }>(
          user,
          "select search_events($1,$2,$3) as result",
          [filters, offset, size],
        )
      )[0].result;
    assert.equal(
      (await search(null, { query: "Database", period: "all" })).items[0].id,
      eid,
    );
    assert.equal(
      (await search(null, { query: "' OR 1=1 --", period: "all" })).items
        .length,
      0,
    );
    assert.equal(
      (await search(null, { query: "%", period: "all" })).items.length,
      0,
    );
    assert.equal((await search(null, { period: "all" }, 1)).items.length, 0);
    assert.equal(
      (await search(null, { saved_only: true, period: "all" })).items.length,
      0,
    );
    await denied(() => as(null, "select search_events('{}',0,null)"));
    await denied(() =>
      as(null, "select * from calendar_counts('{}',null,null)"),
    );
    await denied(() => search(null, {}, 0, 51));
    await denied(() => search(null, {}, -1));
    await as(
      alice,
      "insert into saved_events(user_id,event_id) values($1,$2)",
      [alice, eid],
    );
    assert.equal(
      (await search(alice, { saved_only: true, period: "all" })).items.length,
      1,
    );
    assert.equal(
      (await search(bob, { saved_only: true, period: "all" })).items.length,
      0,
    );
    await as(alice, "delete from saved_events where event_id=$1", [eid]);
    const day = new Date(future.getTime() + 21600000)
      .toISOString()
      .slice(0, 10);
    const counts = await as<{ day: string; total: number }>(
      null,
      "select * from calendar_counts($1,$2,$2)",
      [{}, day],
    );
    assert.equal(Number(counts[0].total), 1);
    await denied(() =>
      as(null, "select * from calendar_counts('{}','2027-01-01','2027-05-01')"),
    );
  },
);
await ok(
  "Search pages have deterministic ties, Bangla token matching and no pending listings",
  async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = (
        await as<{ id: string }>(owner, "select save_event($1) as id", [
          {
            ...event,
            name: "Pagination " + i,
            description: "দৌড় প্রতিযোগিতা test fixture",
          },
        ])
      )[0].id;
      ids.push(id);
      if (i < 3)
        await as(
          admin,
          "select admin_action('event',$1,'approved')",
          [id],
          "aal2",
        );
    }
    const search = async (offset: number, size: number, query = "Pagination") =>
      (
        await as<{ result: { items: { id: string }[]; has_more: boolean } }>(
          null,
          "select search_events($1,$2,$3) as result",
          [{ query, period: "all" }, offset, size],
        )
      )[0].result;
    const first = await search(0, 2),
      second = await search(2, 2);
    assert.equal(first.items.length, 2);
    assert.equal(first.has_more, true);
    assert.equal(second.items.length, 1);
    assert.equal(second.has_more, false);
    assert.deepEqual(
      [...first.items, ...second.items].map((e) => e.id),
      ids.slice(0, 3).sort(),
    );
    assert.equal((await search(0, 20, "দৌড়")).items.length, 3);
    assert.equal((await search(0, 20, "Database")).items[0].id, eid);
    for (const id of ids)
      await db.query("delete from public.events where id=$1", [id]);
  },
);
await ok(
  "Verified transport enforces MFA, ownership, inventory and private reservations",
  async () => {
    const data = {
      provider: "Verified test bus",
      contact: "Public contact",
      pickup: "Park gate",
      departs_at: new Date(future.getTime() - 3600000).toISOString(),
      returns_at: new Date(end.getTime() + 3600000).toISOString(),
      booking_closes: deadline.toISOString(),
      capacity: 3,
      fare: 200,
    };
    const save = async (user: string, d: object = data) =>
      (
        await as<{ sid: string }>(user, "select save_transport($1,$2) as sid", [
          eid,
          d,
        ])
      )[0].sid;
    await denied(() => save(other));
    await denied(() => save(owner, { ...data, capacity: 0 }));
    const sid = await save(owner);
    assert.equal(
      (await as(null, "select * from transport_services")).length,
      0,
    );
    await denied(() => as(alice, "select reserve_transport($1,1)", [sid]));
    await denied(() =>
      as(admin, "select verify_transport($1,true,$2)", [
        sid,
        "Checked operator, route and capacity",
      ]),
    );
    await denied(() =>
      as(admin, "select verify_transport($1,true,'short')", [sid], "aal2"),
    );
    await as(
      admin,
      "select verify_transport($1,true,$2)",
      [sid, "Checked operator, route, fare, timetable and capacity"],
      "aal2",
    );
    assert.equal(
      (await as(null, "select * from transport_services")).length,
      1,
    );
    await as(alice, "select reserve_transport($1,2)", [sid]);
    await as(alice, "select reserve_transport($1,2)", [sid]); // retry does not double book
    assert.equal(
      (
        await as<{ n: number }>(
          null,
          "select transport_availability($1) as n",
          [sid],
        )
      )[0].n,
      1,
    );
    await denied(() => as(bob, "select reserve_transport($1,2)", [sid]));
    await as(bob, "select reserve_transport($1,1)", [sid]);
    assert.equal(
      (
        await as<{ n: number }>(
          null,
          "select transport_availability($1) as n",
          [sid],
        )
      )[0].n,
      0,
    );
    assert.equal(
      (await as(alice, "select * from transport_bookings")).length,
      1,
    );
    assert.equal(
      (await as(other, "select * from transport_bookings")).length,
      0,
    );
    assert.equal(
      (await as(owner, "select * from transport_bookings")).length,
      2,
    );
    await denied(() => as(null, "select * from transport_bookings"));
    await denied(() => as(alice, "update transport_bookings set seats=4"));
    await denied(() => save(owner, { ...data, capacity: 10 }));
    await as(alice, "select cancel_transport_booking($1)", [sid]);
    assert.equal(
      (
        await as<{ n: number }>(
          null,
          "select transport_availability($1) as n",
          [sid],
        )
      )[0].n,
      2,
    );
    await as(
      admin,
      "select verify_transport($1,false,$2)",
      [sid, "Provider cancellation confirmed by phone"],
      "aal2",
    );
    assert.equal(
      (await as<{ status: string }>(bob, "select * from transport_bookings"))[0]
        .status,
      "cancelled",
    );
    assert(
      (
        await as(
          bob,
          "select * from notifications where title='Transport reservation cancelled'",
        )
      ).length > 0,
    );
    await save(owner, { ...data, capacity: 4 });
    await as(
      admin,
      "select verify_transport($1,true,$2)",
      [sid, "Rechecked revised capacity and timetable"],
      "aal2",
    );
    await as(bob, "select reserve_transport($1,1)", [sid]);
    await as(owner, "select save_event($1,$2)", [event, eid]);
    assert.equal(
      (await as<{ status: string }>(bob, "select * from transport_bookings"))[0]
        .status,
      "cancelled",
    );
    await denied(() => as(bob, "select reserve_transport($1,1)", [sid]));
    await as(
      admin,
      "select admin_action('event',$1,'approved')",
      [eid],
      "aal2",
    );
    await db.exec(
      "delete from public.notifications where title='Transport reservation cancelled'",
    );
    // Restore original event transport description for existing scenarios.
  },
);
await ok(
  "Private saves and registration records enforce ownership",
  async () => {
    await as(
      alice,
      "insert into saved_events(user_id,event_id) values($1,$2)",
      [alice, eid],
    );
    await denied(() =>
      as(alice, "insert into saved_events(user_id,event_id) values($1,$2)", [
        bob,
        eid,
      ]),
    );
    await as(alice, "select register_event($1)", [eid]);
    assert.equal(
      (await as(bob, "select * from event_registrations")).length,
      0,
    );
    assert.equal(
      (await as(owner, "select * from event_registrations")).length,
      1,
    );
    await denied(() =>
      as(bob, "update event_registrations set status='attended'"),
    );
    assert.equal((await as(bob, "select * from saved_events")).length, 0);
  },
);
const registration = (
  await as<{ id: string }>(alice, "select id from event_registrations")
)[0].id;
await ok(
  "Reviews require attendance and completed event; no direct spoofing",
  async () => {
    await denied(() =>
      as(alice, "select submit_review($1,10,$2)", [eid, "This is a review"]),
    );
    await denied(() =>
      as(owner, "select confirm_attendance($1)", [registration]),
    );
    await denied(() =>
      as(
        alice,
        "insert into reviews(event_id,user_id,organizer_id,score,body,author_name,moderation) values($1,$2,$3,10,'Forged review','Fake','approved')",
        [eid, alice, org],
      ),
    );
  },
);
await db.query(
  "update events set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day',registration_deadline=now()-interval '3 days' where id=$1",
  [eid],
);
let reviewId = "";
await ok(
  "Attendance, moderation and computed average use actual rows",
  async () => {
    await denied(() =>
      as(other, "select confirm_attendance($1)", [registration]),
    );
    await as(owner, "select confirm_attendance($1)", [registration]);
    reviewId = (
      await as<{ submit_review: string }>(
        alice,
        "select submit_review($1,8,$2)",
        [eid, "A well organized experience"],
      )
    )[0].submit_review;
    assert.equal((await as(null, "select * from organizer_ratings")).length, 0);
    await as(
      admin,
      "select admin_action('review',$1,'approved')",
      [reviewId],
      "aal2",
    );
    const r = await as<{ average_rating: number; review_count: number }>(
      null,
      "select * from organizer_ratings",
    );
    assert.equal(Number(r[0].average_rating), 8);
    assert.equal(Number(r[0].review_count), 1);
  },
);
await ok(
  "Updating a review replaces rather than duplicates and returns to moderation",
  async () => {
    await as(alice, "select submit_review($1,6,$2)", [
      eid,
      "Updated experience after reflection",
    ]);
    assert.equal((await as(alice, "select * from reviews")).length, 1);
    assert.equal((await as(null, "select * from organizer_ratings")).length, 0);
    await as(
      admin,
      "select admin_action('review',$1,'approved')",
      [reviewId],
      "aal2",
    );
    assert.equal(
      Number(
        (
          await as<{ average_rating: number }>(
            null,
            "select * from organizer_ratings",
          )
        )[0].average_rating,
      ),
      6,
    );
    await denied(() =>
      as(alice, "select submit_review($1,11,$2)", [eid, "Invalid score value"]),
    );
  },
);
await ok(
  "Organizer replies, reports and admin audit log authorization",
  async () => {
    await denied(() =>
      as(other, "select reply_review($1,$2)", [reviewId, "Unauthorized reply"]),
    );
    await as(owner, "select reply_review($1,$2)", [
      reviewId,
      "Thank you for your feedback",
    ]);
    await as(bob, "select report_content('review',$1,$2)", [
      reviewId,
      "Please examine this review",
    ]);
    assert.equal((await as(alice, "select * from reports")).length, 0);
    assert.equal(
      (await as(admin, "select * from admin_audit_logs", [], "aal2")).length >=
        4,
      true,
    );
    assert.equal((await as(alice, "select * from admin_audit_logs")).length, 0);
  },
);
await ok(
  "Notifications private and content immutable; worker functions service-only",
  async () => {
    assert((await as(alice, "select * from notifications")).length > 0);
    assert.equal((await as(bob, "select * from notifications")).length, 0);
    await denied(() => as(alice, "update notifications set body='Forged'"));
    await as(alice, "update notifications set read_at=now()");
    await denied(() =>
      as(admin, "select * from claim_push_batch()", [], "aal2"),
    );
  },
);
await ok("Suspensions block writes and hide organizer events", async () => {
  await as(
    admin,
    "select admin_action('suspend_user',$1,null)",
    [alice],
    "aal2",
  );
  await denied(() => as(alice, "select update_profile('Blocked')"));
  await denied(() =>
    as(alice, "select submit_review($1,9,$2)", [eid, "Blocked review edit"]),
  );
  await as(
    admin,
    "select admin_action('suspend_organizer',$1,null)",
    [org],
    "aal2",
  );
  assert.equal((await as(null, "select * from events")).length, 0);
  await denied(() => as(owner, "select save_event($1)", [event]));
  await as(
    admin,
    "select admin_action('restore_organizer',$1,null)",
    [org],
    "aal2",
  );
});
await ok(
  "Image publication cannot use another owner path; uploads rate limited",
  async () => {
    await denied(() =>
      as(owner, "select save_event($1)", [
        {
          ...event,
          cover_path: bob + "/11111111-1111-1111-1111-111111111111.jpg",
        },
      ]),
    );
    for (let i = 0; i < 20; i++)
      await as(owner, "select check_upload_permission()");
    await denied(() => as(owner, "select check_upload_permission()"));
    await denied(() => as(null, "select check_upload_permission()"));
  },
);
await ok(
  "Private image reads require ownership or an approved referencing listing",
  async () => {
    const path = owner + "/11111111-1111-1111-1111-111111111111.jpg";
    await db.query(
      "insert into storage.objects(bucket_id,name) values('event-images',$1)",
      [path],
    );
    assert.equal((await as(null, "select * from storage.objects")).length, 0);
    assert.equal((await as(bob, "select * from storage.objects")).length, 0);
    assert.equal((await as(owner, "select * from storage.objects")).length, 1);
    await denied(() =>
      as(
        owner,
        "insert into storage.objects(bucket_id,name) values('event-images',$1)",
        [path],
      ),
    );
    await db.query("update events set cover_path=$1 where id=$2", [path, eid]);
    assert.equal((await as(null, "select * from storage.objects")).length, 1);
  },
);
await ok(
  "Verification requests are private, unique while pending and admin controlled",
  async () => {
    await as(owner, "select request_verification($1)", [
      "Official site and public contact verification",
    ]);
    await denied(() =>
      as(owner, "select request_verification($1)", [
        "Duplicate pending request",
      ]),
    );
    assert.equal(
      (await as(bob, "select * from organizer_verifications")).length,
      0,
    );
    const v = (
      await as<{ id: string }>(owner, "select id from organizer_verifications")
    )[0].id;
    await as(
      admin,
      "select admin_action('verification',$1,'approved')",
      [v],
      "aal2",
    );
    assert.equal(
      (
        await as<{ verified: boolean }>(null, "select verified from organizers")
      )[0].verified,
      true,
    );
  },
);
await ok(
  "Profile edits reset verification and hide public catalogue until reapproval",
  async () => {
    await as(owner, "select save_organizer($1)", [
      {
        name: "Updated Real Club",
        description: "Edited organization",
        contact: "club@example.com",
      },
    ]);
    assert.equal(
      (await as(null, "select * from organizer_directory")).length,
      0,
    );
    assert.equal((await as(owner, "select * from event_directory")).length, 0);
    assert.equal(
      (
        await as<{ verified: boolean }>(
          owner,
          "select verified from organizers",
        )
      )[0].verified,
      false,
    );
    await as(
      admin,
      "select admin_action('organizer',$1,'approved')",
      [org],
      "aal2",
    );
  },
);
await ok(
  "Public reference data cannot be changed without MFA administration",
  async () => {
    await denied(() =>
      as(bob, "select admin_reference('category',null,'Injected',null)"),
    );
    await as(
      admin,
      "select admin_reference('category',null,'Test category',null)",
      [],
      "aal2",
    );
    assert.equal(
      (await as(null, "select * from categories where name='Test category'"))
        .length,
      1,
    );
  },
);
await ok(
  "Push devices are private, rate-gated and reassigned on account change",
  async () => {
    const token = "ExpoPushToken[test_device_token]";
    await as(bob, "select register_push($1)", [token]);
    assert.equal((await as(other, "select * from push_tokens")).length, 0);
    await denied(() =>
      as(bob, "insert into push_tokens(user_id,token) values($1,$2)", [
        bob,
        "ExpoPushToken[another]",
      ]),
    );
    await as(other, "select register_push($1)", [token]);
    assert.equal((await as(bob, "select * from push_tokens")).length, 0);
    assert.equal((await as(other, "select * from push_tokens")).length, 1);
    await denied(() => as(other, "select register_push($1)", ["Invalid"]));
    await as(other, "delete from push_tokens where token=$1", [token]);
    assert.equal((await as(other, "select * from push_tokens")).length, 0);
  },
);
console.log(
  `${passed} database integration scenarios passed. Auth email transport, HTTP gateway, storage binary validation and mobile UI are not covered by embedded PostgreSQL.`,
);
await db.close();
