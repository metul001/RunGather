import React, { useState, useEffect } from "react";
import { View, Alert } from "react-native";
import { useData } from "../context";
import { db, rpc, rows } from "../supabase";
import { Organizer, Event, Registration, Review } from "../types";
import {
  Txt,
  Panel,
  Field,
  Button,
  ErrorText,
  Loading,
  Chips,
  AssetImage,
  Empty,
} from "../components/UI";
import { OrganizerTransport } from "../components/TransportBooking";
import { OrganizerRating } from "../components/OrganizerRating";
import { message, uploadImage, confirm } from "../actions";
import { dhakaDate, shiftDate, localInputToISO, httpsUrl } from "../domain";
export function OrganizerDashboard() {
  const { session, refresh } = useData();
  const [org, setOrg] = useState<Organizer | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [registrations, setRegistrations] = useState<Registration[]>([]),
    [reviews, setReviews] = useState<Review[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Event | null | undefined>(undefined),
    [evidence, setEvidence] = useState(""),
    [reply, setReply] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    description: "",
    contact: "",
    website: "",
    social_url: "",
    logo_path: "",
  });
  const load = async () => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await db
        .from("organizers")
        .select("*")
        .eq("owner_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      setOrg(data);
      if (data) {
        setForm({
          name: data.name,
          description: data.description,
          contact: data.contact,
          website: data.website ?? "",
          social_url: data.social_url ?? "",
          logo_path: data.logo_path ?? "",
        });
        const [e, r] = await Promise.all([
          rows<Event>("events", { key: "organizer_id", value: data.id }),
          rows<Review>("reviews", { key: "organizer_id", value: data.id }),
        ]);
        setEvents(e);
        setReviews(r);
        const { data: reg, error: re } = await db
          .from("event_registrations")
          .select("*")
          .in(
            "event_id",
            e.length
              ? e.map((x) => x.id)
              : ["00000000-0000-0000-0000-000000000000"],
          );
        if (re) throw re;
        setRegistrations(reg);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [session?.user.id]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  if (!session) return <Empty text="Sign in to create an organizer profile." />;
  if (loading) return <Loading />;
  if (editing !== undefined)
    return (
      <EventEditor
        event={editing}
        onDone={async () => {
          setEditing(undefined);
          await load();
          await refresh();
        }}
      />
    );
  const approved = reviews.filter((r) => r.moderation === "approved");
  const avg = approved.length
    ? approved.reduce((s, r) => s + r.score, 0) / approved.length
    : null;
  return (
    <View style={{ gap: 12 }}>
      <Txt bold size={28}>
        Organizer workspace.
      </Txt>
      <ErrorText text={error} />
      {org && (
        <Panel>
          <OrganizerRating
            name={org.name}
            score={avg}
            count={approved.length}
            verified={org.verified}
          />
          <Txt muted>
            Profile: {org.approval}
            {org.suspended ? " · Suspended" : ""}
          </Txt>
          <Txt>
            {events.length} events · {registrations.length} registration /
            interest records ·{" "}
            {registrations.filter((r) => r.status === "attended").length}{" "}
            confirmed attendees
          </Txt>
        </Panel>
      )}
      <Panel>
        <Txt bold size={22}>
          {org ? "Organization profile" : "Create your organizer profile"}
        </Txt>
        {(
          ["name", "description", "contact", "website", "social_url"] as const
        ).map((k) => (
          <Field
            key={k}
            label={
              {
                name: "Organizer name",
                description: "Description",
                contact: "Public contact email or phone",
                website: "Website (optional HTTPS)",
                social_url: "Social link (optional HTTPS)",
              }[k]
            }
            multiline={k === "description"}
            value={form[k]}
            onChangeText={(v) => setForm({ ...form, [k]: v })}
          />
        ))}
        {!!form.logo_path && <AssetImage path={form.logo_path} height={110} />}
        <Button
          title="Upload logo"
          secondary
          disabled={!org || busy}
          onPress={() =>
            act(async () => {
              const path = await uploadImage();
              if (path) setForm({ ...form, logo_path: path });
            })
          }
        />
        {!org && (
          <Txt muted>Create your profile first, then upload its logo.</Txt>
        )}
        <Txt muted>
          Changing profile details returns the organizer to approval and clears
          verification. Public events stay hidden until reapproved.
        </Txt>
        <Button
          title="Submit profile for approval"
          disabled={busy}
          busy={busy}
          onPress={() =>
            act(async () => {
              if (form.website) httpsUrl(form.website);
              if (form.social_url) httpsUrl(form.social_url);
              await rpc("save_organizer", { data: form });
              await load();
              await refresh();
              Alert.alert(
                "Submitted",
                "An administrator must approve your organizer profile.",
              );
            })
          }
        />
      </Panel>
      {org && (
        <Panel>
          <Txt bold>Verification request</Txt>
          <Txt muted>
            Provide a public official website and contact details the
            administrator can independently check. Do not submit identity
            documents here.
          </Txt>
          <Field
            label="Verification evidence"
            value={evidence}
            onChangeText={setEvidence}
            multiline
            maxLength={3000}
          />
          <Button
            title="Request verification"
            disabled={busy}
            busy={busy}
            onPress={() =>
              act(async () => {
                await rpc("request_verification", { evidence_text: evidence });
                setEvidence("");
                Alert.alert("Request sent");
              })
            }
          />
        </Panel>
      )}
      <Button
        title="Create event"
        disabled={org?.approval !== "approved" || org.suspended}
        onPress={() => setEditing(null)}
      />
      <Txt bold size={23}>
        Your events
      </Txt>
      {events.map((e) => (
        <Panel key={e.id}>
          <Txt bold>{e.name}</Txt>
          <Txt muted>
            {dhakaDate(e.starts_at)} · {e.approval}
            {e.cancelled ? " · Cancelled" : ""}
          </Txt>
          <Button
            secondary
            title="Edit and resubmit"
            onPress={() => setEditing(e)}
          />
          <Button
            secondary
            title="Cancel event"
            disabled={e.cancelled || busy}
            onPress={() =>
              confirm(
                "Cancel event",
                "Saved users and registrants will receive an in-app update when this approved event is cancelled.",
                () =>
                  act(async () => {
                    await rpc("cancel_event", { eid: e.id });
                    await load();
                    await refresh();
                  }),
              )
            }
          />
          <OrganizerTransport event={e} />
          <Txt bold>Attendee records</Txt>
          <Txt muted>
            External bookings must be checked with your registration system.
            Confirm attendance only after the event actually finishes.
          </Txt>
          {registrations
            .filter((r) => r.event_id === e.id)
            .map((r) => (
              <View key={r.id} style={{ gap: 7, paddingVertical: 8 }}>
                <Txt size={12}>Participant ID: {r.user_id}</Txt>
                <Txt>{r.status}</Txt>
                {["registered", "interested"].includes(r.status) && (
                  <Button
                    secondary
                    title="Confirm attendance"
                    disabled={
                      busy || new Date(e.ends_at) > new Date() || e.cancelled
                    }
                    onPress={() =>
                      confirm(
                        "Confirm attendance",
                        "Confirm this participant actually attended. This enables a verified-attendance review.",
                        () =>
                          act(async () => {
                            await rpc("confirm_attendance", {
                              registration_id: r.id,
                            });
                            await load();
                          }),
                      )
                    }
                  />
                )}
              </View>
            ))}
        </Panel>
      ))}
      <Txt bold size={23}>
        Reviews & responses
      </Txt>
      {reviews.map((r) => (
        <Panel key={r.id}>
          <Txt bold>
            {r.author_name} · {r.score}/10 · {r.moderation}
          </Txt>
          <Txt>{r.body}</Txt>
          <Field
            label="Public response"
            value={reply[r.id] ?? r.reply ?? ""}
            onChangeText={(value) => setReply({ ...reply, [r.id]: value })}
            multiline
            maxLength={2000}
          />
          <Button
            secondary
            title="Save response"
            disabled={busy}
            busy={busy}
            onPress={() =>
              act(async () => {
                await rpc("reply_review", {
                  rid: r.id,
                  reply_text: reply[r.id] ?? r.reply ?? "",
                });
                await load();
              })
            }
          />
        </Panel>
      ))}
    </View>
  );
}
function EventEditor({
  event,
  onDone,
}: {
  event: Event | null;
  onDone: () => void;
}) {
  const { divisions, districts, categories } = useData();
  const tomorrow = shiftDate(dhakaDate(), 7);
  const localTime = (iso: string) =>
    new Date(new Date(iso).getTime() + 21600000).toISOString().slice(11, 16);
  const [form, setForm] = useState({
    transport_status: event?.transport_status ?? "unknown",
    transport_details: event?.transport_details ?? "",
    transport_url: event?.transport_url ?? "",
    name: event?.name ?? "",
    description: event?.description ?? "",
    venue: event?.venue ?? "",
    address: event?.address ?? "",
    contact: event?.contact ?? "",
    map_url: event?.map_url ?? "",
    registration_url: event?.registration_url ?? "",
    price: String(event?.price ?? 0),
    cover_path: event?.cover_path ?? "",
    date: event ? dhakaDate(event.starts_at) : tomorrow,
    start: event ? localTime(event.starts_at) : "06:00",
    endDate: event ? dhakaDate(event.ends_at) : tomorrow,
    end: event ? localTime(event.ends_at) : "10:00",
    deadlineDate: event ? dhakaDate(event.registration_deadline) : tomorrow,
    deadlineTime: event ? localTime(event.registration_deadline) : "05:00",
  });
  const [division, setDivision] = useState(event?.division_id ?? 1),
    [district, setDistrict] = useState(event?.district_id ?? 1),
    [category, setCategory] = useState(
      event?.category_id ?? categories[0]?.id ?? 1,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Button secondary title="‹ Back to dashboard" onPress={onDone} />
      <Txt bold size={28}>
        {event ? "Edit event" : "Create an event"}
      </Txt>
      <Txt muted>
        All dates and times below use Bangladesh time. Submissions and edits
        require admin approval.
      </Txt>
      <ErrorText text={error} />
      {(
        [
          "name",
          "description",
          "venue",
          "address",
          "contact",
          "map_url",
          "registration_url",
          "price",
        ] as const
      ).map((k) => (
        <Field
          key={k}
          label={
            {
              name: "Event name",
              description: "Description",
              venue: "Venue",
              address: "Full address",
              contact: "Public contact information",
              map_url: "Map link (optional HTTPS)",
              registration_url:
                "Organizer registration link (optional HTTPS; required for paid events)",
              price: "Price in BDT (0 for free)",
            }[k]
          }
          value={form[k]}
          multiline={k === "description"}
          keyboardType={k === "price" ? "decimal-pad" : "default"}
          onChangeText={(v) => set(k, v)}
        />
      ))}
      <Panel>
        <Txt bold>Runner bus / event transport</Txt>
        <Chips
          items={[
            { id: "unknown", name: "Not confirmed" },
            { id: "available", name: "Available" },
            { id: "unavailable", name: "Not provided" },
          ]}
          value={form.transport_status}
          onChange={(v) => set("transport_status", v)}
        />
        <Field
          label="Transport details: provider, pickup, departure, return, fare and contact"
          multiline
          maxLength={2000}
          value={form.transport_details}
          onChangeText={(v) => set("transport_details", v)}
        />
        <Field
          label="Transport booking / information URL (HTTPS, optional)"
          maxLength={2048}
          value={form.transport_url}
          onChangeText={(v) => set("transport_url", v)}
          autoCapitalize="none"
        />
        <Txt muted>
          Only list services confirmed with the provider. Changes require event
          approval.
        </Txt>
      </Panel>
      <Txt bold>Division</Txt>
      <Chips
        items={divisions}
        value={division}
        onChange={(id) => {
          setDivision(id);
          setDistrict(districts.find((d) => d.division_id === id)?.id ?? 0);
        }}
      />
      <Txt bold>District</Txt>
      <Chips
        items={districts.filter((d) => d.division_id === division)}
        value={district}
        onChange={setDistrict}
      />
      <Txt bold>Category</Txt>
      <Chips items={categories} value={category} onChange={setCategory} />
      {(
        [
          "date",
          "start",
          "endDate",
          "end",
          "deadlineDate",
          "deadlineTime",
        ] as const
      ).map((k) => (
        <Field
          key={k}
          label={
            {
              date: "Start date (YYYY-MM-DD)",
              start: "Start time (HH:MM, 24-hour)",
              endDate: "End date (YYYY-MM-DD)",
              end: "End time (HH:MM, 24-hour)",
              deadlineDate: "Registration deadline (YYYY-MM-DD)",
              deadlineTime: "Registration closes at (HH:MM)",
            }[k]
          }
          value={form[k]}
          onChangeText={(v) => set(k, v)}
        />
      ))}
      <AssetImage path={form.cover_path} />
      <Button
        secondary
        title="Choose cover image"
        disabled={busy}
        busy={busy}
        onPress={() =>
          act(async () => {
            const path = await uploadImage();
            if (path) set("cover_path", path);
          })
        }
      />
      <Button
        title="Submit event for approval"
        disabled={busy}
        busy={busy}
        onPress={() =>
          act(async () => {
            if (form.transport_url) httpsUrl(form.transport_url);
            if (
              form.transport_status === "available" &&
              form.transport_details.trim().length < 10
            )
              throw Error(
                "Add transport pickup, schedule, fare and contact details.",
              );
            if (form.map_url) httpsUrl(form.map_url);
            if (form.registration_url) httpsUrl(form.registration_url);
            if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0)
              throw Error("Enter a valid nonnegative price.");
            const data = {
              ...form,
              division_id: division,
              district_id: district,
              category_id: category,
              starts_at: localInputToISO(form.date, form.start),
              ends_at: localInputToISO(form.endDate, form.end),
              registration_deadline: localInputToISO(
                form.deadlineDate,
                form.deadlineTime,
              ),
              price: Number(form.price),
            };
            if (new Date(data.ends_at) <= new Date(data.starts_at))
              throw Error("End must be after start.");
            await rpc("save_event", { data, event_id: event?.id ?? null });
            Alert.alert(
              "Event submitted",
              "An administrator must approve it before it appears publicly.",
            );
            onDone();
          })
        }
      />
    </View>
  );
}
