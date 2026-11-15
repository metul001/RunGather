import React, { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { useData } from "../context";
import { db, rpc, rows } from "../supabase";
import { Review, Registration } from "../types";
import {
  Txt,
  Panel,
  Button,
  Field,
  ErrorText,
  AssetImage,
  Empty,
  Chips,
} from "../components/UI";
import { TransportBooking } from "../components/TransportBooking";
import { useI18n } from "../i18n";
import { useEventSearch } from "../useEventSearch";
import { OrganizerRating } from "../components/OrganizerRating";
import { EventCard } from "../components/EventCard";
import { dhakaDate } from "../domain";
import { message, openURL, confirm } from "../actions";
export function Report({ kind, target }: { kind: string; target: string }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Button
        secondary
        title="Report this content"
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Field
            label="Reason for reporting (10+ characters)"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={2000}
          />
          <ErrorText text={error} />
          <Button
            title="Send report"
            disabled={busy}
            busy={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await rpc("report_content", {
                  kind,
                  target,
                  reason_text: reason,
                });
                setOpen(false);
                setReason("");
                Alert.alert(
                  "Report sent",
                  "An administrator can review your report.",
                );
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </View>
  );
}
function Reviews({ organizerId }: { organizerId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    rows<Review>("reviews", { key: "organizer_id", value: organizerId })
      .then((r) => setReviews(r.filter((x) => x.moderation === "approved")))
      .catch((e) => setError(message(e)));
  }, [organizerId]);
  return (
    <>
      <Txt translate bold size={22}>
        Verified-attendance reviews
      </Txt>
      <ErrorText text={error} />
      {!reviews.length && (
        <Empty text="No approved reviews yet. Ratings are never filled with sample scores." />
      )}
      {reviews.map((r) => (
        <Panel key={r.id}>
          <Txt bold>
            {r.author_name} · {r.score}/10
          </Txt>
          <Txt>{r.body}</Txt>
          {r.reply && (
            <>
              <Txt translate bold size={13}>
                Organizer response
              </Txt>
              <Txt muted>{r.reply}</Txt>
            </>
          )}
          <Report kind="review" target={r.id} />
        </Panel>
      ))}
    </>
  );
}
export function EventDetails({
  id,
  openOrganizer,
}: {
  id: string;
  openOrganizer: (id: string) => void;
}) {
  const { events, session, saved, refresh } = useData();
  const { t, locale } = useI18n();
  const e = events.find((x) => x.id === id);
  const [registration, setRegistration] = useState<Registration | null>(null),
    [rating, setRating] = useState(10),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setRegistration(null);
    if (session)
      db.from("event_registrations")
        .select("*")
        .eq("event_id", id)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!live) return;
          if (error) setError(error.message);
          else setRegistration(data);
        });
    return () => {
      live = false;
    };
  }, [id, session]);
  if (!e)
    return (
      <Empty text="This event is unavailable. It may be pending review, removed or hosted by a suspended organizer." />
    );
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
    <View style={{ gap: 14 }}>
      <AssetImage path={e.cover_path} height={220} />
      <Txt muted>
        {e.category_name} · {e.status}
      </Txt>
      <Txt size={30} bold>
        {e.name}
      </Txt>
      <OrganizerRating
        name={e.organizer_name}
        score={e.average_rating}
        count={e.review_count}
        verified={e.organizer_verified}
        onPress={() => openOrganizer(e.organizer_id)}
      />
      <Panel>
        <Txt translate bold>
          When & where
        </Txt>
        <Txt>
          {new Date(e.starts_at).toLocaleString(locale, {
            timeZone: "Asia/Dhaka",
          })}{" "}
          —{" "}
          {new Date(e.ends_at).toLocaleString(locale, {
            timeZone: "Asia/Dhaka",
          })}{" "}
          (Bangladesh)
        </Txt>
        <Txt>{e.venue}</Txt>
        <Txt muted>
          {e.address} · {e.district_name}, {e.division_name}
        </Txt>
        {e.map_url && (
          <Button
            secondary
            title="Open map ↗"
            onPress={() => act(() => openURL(e.map_url!))}
          />
        )}
        <Txt bold>
          {Number(e.price) === 0
            ? t("Free")
            : `৳${Number(e.price).toLocaleString(locale)}`}
        </Txt>
        <Txt muted>
          {t("Registration closes")}:{" "}
          {new Date(e.registration_deadline).toLocaleString(locale, {
            timeZone: "Asia/Dhaka",
          })}
        </Txt>
        <Txt>
          {t("Contact")}: {e.contact}
        </Txt>
      </Panel>
      <Panel>
        <Txt translate bold>
          Runner bus / transport
        </Txt>
        <Txt translate>
          {e.transport_status === "available"
            ? "Organizer-listed transport available"
            : e.transport_status === "unavailable"
              ? "Organizer does not provide transport"
              : "Transport availability not confirmed"}
        </Txt>
        {!!e.transport_details && <Txt>{e.transport_details}</Txt>}
        <Txt translate muted>
          Confirm seats, pickup time, fare and return arrangements with the
          organizer before travelling.
        </Txt>
        {!!e.transport_url && (
          <Button
            secondary
            disabled={busy}
            busy={busy}
            title="Transport information / booking ↗"
            onPress={() => act(() => openURL(e.transport_url!))}
          />
        )}
      </Panel>
      <TransportBooking key={session?.user.id ?? "guest"} eventId={id} />
      <Txt>{e.description}</Txt>
      <ErrorText text={error} />
      <Button
        disabled={busy}
        busy={busy}
        title={saved.includes(id) ? "Remove from saved" : "Save event"}
        secondary
        onPress={() =>
          act(async () => {
            if (!session) throw Error("Sign in from Profile first.");
            const result = saved.includes(id)
              ? await db
                  .from("saved_events")
                  .delete()
                  .eq("user_id", session.user.id)
                  .eq("event_id", id)
              : await db
                  .from("saved_events")
                  .insert({ user_id: session.user.id, event_id: id });
            if (result.error) throw result.error;
            await refresh();
          })
        }
      />
      <Button
        disabled={
          busy || e.cancelled || new Date(e.registration_deadline) < new Date()
        }
        title={
          e.registration_url
            ? "Continue to organizer registration ↗"
            : "Register for this free event"
        }
        onPress={() => {
          if (!session) {
            setError("Sign in from Profile first.");
            return;
          }
          confirm(
            "Registration",
            e.registration_url
              ? "This opens the organizer’s website. RunGather records your interest, not a confirmed booking. Verify payment details with the organizer."
              : "Confirm your free registration for this event?",
            () =>
              act(async () => {
                const status = await rpc<string>("register_event", { eid: id });
                if (e.registration_url) await openURL(e.registration_url);
                else
                  Alert.alert(
                    "Registered",
                    "Your free registration is saved in Profile.",
                  );
                setRegistration({
                  id: "",
                  event_id: id,
                  user_id: session.user.id,
                  status,
                  created_at: "",
                });
              }),
          );
        }}
      />
      {registration && (
        <>
          <Txt muted>
            {t("RunGather record")}: {t(registration.status)}
          </Txt>
          {registration.status !== "attended" &&
            registration.status !== "cancelled" && (
              <Button
                secondary
                title="Cancel my RunGather registration / interest"
                onPress={() =>
                  confirm(
                    "Cancel registration",
                    "External bookings must also be cancelled with the organizer.",
                    () =>
                      act(async () => {
                        await rpc("cancel_registration", { eid: id });
                        setRegistration({
                          ...registration,
                          status: "cancelled",
                        });
                      }),
                  )
                }
              />
            )}
        </>
      )}
      <Report kind="event" target={id} />
    </View>
  );
}
export function OrganizerDetails({
  id,
  openEvent,
  openOrganizer,
}: {
  id: string;
  openEvent: (id: string) => void;
  openOrganizer: (id: string) => void;
}) {
  const { organizers, revision } = useData();
  const page = useEventSearch({ organizer: id, period: "all" }, revision);
  const o = organizers.find((x) => x.id === id);
  if (!o) return <Empty text="Organizer profile is unavailable." />;
  return (
    <View style={{ gap: 14 }}>
      <AssetImage path={o.logo_path} height={140} />
      <OrganizerRating
        name={o.name}
        score={o.average_rating}
        count={o.review_count}
        verified={o.verified}
      />
      <Txt>{o.description}</Txt>
      <Txt muted>
        {o.event_count ?? 0} approved events · {o.review_count} approved reviews
      </Txt>
      <Txt>Contact: {o.contact}</Txt>
      {o.website && (
        <Button
          secondary
          title="Website ↗"
          onPress={() =>
            openURL(o.website!).catch((e) =>
              Alert.alert("Link error", message(e)),
            )
          }
        />
      )}{" "}
      {o.social_url && (
        <Button
          secondary
          title="Social profile ↗"
          onPress={() =>
            openURL(o.social_url!).catch((e) =>
              Alert.alert("Link error", message(e)),
            )
          }
        />
      )}
      <Report kind="organizer" target={o.id} />
      <Reviews organizerId={o.id} />
      <Txt translate bold size={24}>
        Events & past experiences
      </Txt>
      <ErrorText text={page.error} />
      {page.items.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          open={() => openEvent(e.id)}
          organizer={() => openOrganizer(id)}
        />
      ))}
      <Button
        secondary
        title="Previous"
        disabled={page.loading || page.offset === 0}
        onPress={page.previous}
      />
      <Button
        secondary
        title="Next"
        disabled={page.loading || !page.has_more}
        onPress={page.next}
      />
    </View>
  );
}
export function ReviewEditor({
  eventId,
  onDone,
}: {
  eventId: string;
  onDone: () => void;
}) {
  const { session } = useData();
  const [score, setScore] = useState(10),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (session)
      db.from("reviews")
        .select("score,body")
        .eq("event_id", eventId)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) setError(error.message);
          if (data) {
            setScore(data.score);
            setBody(data.body);
          }
        });
  }, [eventId, session]);
  return (
    <Panel>
      <Txt translate bold size={22}>
        Rate your event experience
      </Txt>
      <Txt translate muted>
        Only organizer-confirmed attendees can review completed events. Updated
        reviews return to moderation. One review per person per event.
      </Txt>
      <Chips
        items={Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: String(i + 1),
        }))}
        value={score}
        onChange={setScore}
      />
      <Field
        label="Your review (10–2,000 characters)"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
      />
      <ErrorText text={error} />
      <Button
        title="Submit for moderation"
        disabled={busy}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await rpc("submit_review", {
              eid: eventId,
              rating: score,
              review_text: body,
            });
            Alert.alert(
              "Review submitted",
              "Your score contributes after approval.",
            );
            onDone();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Panel>
  );
}
