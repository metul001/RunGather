import React, { useCallback, useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { db, rpc } from "../supabase";
import { useData } from "../context";
import { useI18n } from "../i18n";
import type { Event } from "../types";
import { localInputToISO } from "../domain";
import { message, confirm } from "../actions";
import { Txt, Panel, Field, Chips, Button, ErrorText, Loading } from "./UI";
type Service = {
  id: string;
  event_id: string;
  provider: string;
  contact: string;
  pickup: string;
  departs_at: string;
  returns_at: string;
  booking_closes: string;
  capacity: number;
  fare: number;
  verified: boolean;
  cancelled: boolean;
};
type Booking = {
  service_id: string;
  user_id: string;
  seats: number;
  status: string;
};
function ServiceInfo({ service: s }: { service: Service }) {
  const { t, locale } = useI18n();
  const date = (value: string) =>
    new Date(value).toLocaleString(locale, { timeZone: "Asia/Dhaka" });
  return (
    <>
      <Txt bold>{s.provider}</Txt>
      <Txt>
        {t("Pickup")}: {s.pickup}
      </Txt>
      <Txt>
        {t("Contact")}: {s.contact}
      </Txt>
      <Txt>
        {t("Departure")}: {date(s.departs_at)}
      </Txt>
      <Txt>
        {t("Return")}: {date(s.returns_at)}
      </Txt>
      <Txt>
        {t("Booking closes")}: {date(s.booking_closes)}
      </Txt>
      <Txt>
        {t("Fare per seat")}: ৳{Number(s.fare).toLocaleString(locale)}
      </Txt>
    </>
  );
}
export function TransportBooking({ eventId }: { eventId: string }) {
  const { session } = useData(),
    { t, locale } = useI18n();
  const [service, setService] = useState<Service | null>(null),
    [booking, setBooking] = useState<Booking | null>(null),
    [available, setAvailable] = useState<number | null>(null),
    [seats, setSeats] = useState(1),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setService(null);
    setBooking(null);
    setAvailable(null);
    try {
      const { data, error } = await db
        .from("transport_services")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      const s = data as Service | null;
      if (s) {
        const availability = await rpc<number | null>(
          "transport_availability",
          { sid: s.id },
        );
        let own: Booking | null = null;
        if (session) {
          const result = await db
            .from("transport_bookings")
            .select("*")
            .eq("service_id", s.id)
            .eq("user_id", session.user.id)
            .maybeSingle();
          if (result.error) throw result.error;
          own = result.data;
        }
        setBooking(own);
        if (own?.status === "reserved") setSeats(own.seats);
        setService(s);
        setAvailable(availability);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [eventId, session?.user.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <Txt translate bold>
        Verified transport seat booking
      </Txt>
      <ErrorText text={error} />
      {loading ? (
        <Loading />
      ) : service ? (
        <>
          <ServiceInfo service={service} />
          <Txt>
            {t("Available seats")}:{" "}
            {available === null ? "—" : available.toLocaleString(locale)}
          </Txt>
          {booking && (
            <Txt>
              {t("Your reservation")}: {t(booking.status)} ·{" "}
              {booking.seats.toLocaleString(locale)}
            </Txt>
          )}
          <Txt muted>
            {t(
              "Seat reservations do not collect payment. Confirm pickup and payment directly with the provider.",
            )}
          </Txt>
          {available !== null && (
            <>
              <Chips
                items={[1, 2, 3, 4].map((id) => ({
                  id,
                  name: `${id.toLocaleString(locale)} ${t("Seats")}`,
                }))}
                value={seats}
                onChange={setSeats}
              />
              <Button
                title="Reserve seats"
                disabled={busy || !session}
                busy={busy}
                onPress={() =>
                  confirm(
                    t("Reserve seats"),
                    `${service.provider} · ${seats} · ৳${Number(service.fare) * seats}. ${t("Payment is arranged directly with the provider.")}`,
                    () =>
                      act(async () => {
                        await rpc("reserve_transport", {
                          sid: service.id,
                          requested_seats: seats,
                        });
                        Alert.alert(
                          t("Your reservation"),
                          t(
                            "Seat reservation saved. Payment is arranged with the provider; this is not a payment receipt.",
                          ),
                        );
                      }),
                  )
                }
              />
            </>
          )}
          {!session && <Txt translate>Sign in from Profile first.</Txt>}
          {booking?.status === "reserved" && (
            <Button
              secondary
              title="Cancel seat reservation"
              disabled={busy}
              busy={busy}
              onPress={() =>
                confirm(
                  t("Cancel seat reservation"),
                  t("Any payment refund must be arranged with the provider."),
                  () =>
                    act(async () => {
                      await rpc("cancel_transport_booking", {
                        sid: service.id,
                      });
                    }),
                )
              }
            />
          )}
        </>
      ) : (
        !error && (
          <Txt translate muted>
            No verified bookable transport listed.
          </Txt>
        )
      )}
      <Button
        secondary
        title="Refresh availability"
        disabled={busy || loading}
        onPress={() => {
          void load();
        }}
      />
    </Panel>
  );
}
const local = (iso: string) =>
  new Date(new Date(iso).getTime() + 21600000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
const parseLocal = (input: string) => {
  const [date, time] = input.trim().split(/[ T]/);
  return localInputToISO(date ?? "", time ?? "");
};
export function OrganizerTransport({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Button
        secondary
        title={open ? "Close transport management" : "Manage transport seats"}
        onPress={() => setOpen((v) => !v)}
      />
      {open && <OrganizerTransportEditor event={event} />}
    </View>
  );
}
function OrganizerTransportEditor({ event }: { event: Event }) {
  const [service, setService] = useState<Service | null>(null),
    [bookings, setBookings] = useState<Booking[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [form, setForm] = useState({
    provider: "",
    contact: event.contact,
    pickup: "",
    departs_at: local(
      new Date(new Date(event.starts_at).getTime() - 3600000).toISOString(),
    ),
    returns_at: local(
      new Date(new Date(event.ends_at).getTime() + 3600000).toISOString(),
    ),
    booking_closes: local(
      new Date(new Date(event.starts_at).getTime() - 7200000).toISOString(),
    ),
    capacity: "40",
    fare: "0",
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await db
        .from("transport_services")
        .select("*")
        .eq("event_id", event.id)
        .maybeSingle();
      if (error) throw error;
      setService(data);
      if (data) {
        const s = data as Service;
        setForm({
          provider: s.provider,
          contact: s.contact,
          pickup: s.pickup,
          departs_at: local(s.departs_at),
          returns_at: local(s.returns_at),
          booking_closes: local(s.booking_closes),
          capacity: String(s.capacity),
          fare: String(s.fare),
        });
        const result = await db
          .from("transport_bookings")
          .select("*")
          .eq("service_id", s.id)
          .eq("status", "reserved")
          .order("user_id")
          .range(offset, offset + 20);
        if (result.error) throw result.error;
        setBookings((result.data ?? []).slice(0, 20));
        setMore((result.data?.length ?? 0) > 20);
      } else setBookings([]);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [event.id, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <Txt bold>Transport seat inventory</Txt>
      <Txt muted>
        One service per event. Supply a confirmed provider and public contact.
        An administrator must independently verify it before booking opens.
        Editing a booked service requires cancellation first; passengers are
        notified. Times use Bangladesh time: YYYY-MM-DD HH:MM.
      </Txt>
      <ErrorText text={error} />
      {loading && <Loading />}
      {service && (
        <Txt>
          {service.cancelled
            ? "Cancelled"
            : service.verified
              ? "Verified"
              : "Awaiting verification"}
        </Txt>
      )}
      {(Object.keys(form) as (keyof typeof form)[]).map((key) => (
        <Field
          key={key}
          label={
            {
              provider: "Transport provider",
              contact: "Public transport contact",
              pickup: "Pickup point / route",
              departs_at: "Departure (YYYY-MM-DD HH:MM)",
              returns_at: "Return (YYYY-MM-DD HH:MM)",
              booking_closes: "Booking deadline (YYYY-MM-DD HH:MM)",
              capacity: "Total seats (1–1000)",
              fare: "Fare per seat (BDT)",
            }[key]
          }
          value={form[key]}
          maxLength={key === "pickup" ? 500 : 200}
          keyboardType={
            key === "capacity"
              ? "number-pad"
              : key === "fare"
                ? "decimal-pad"
                : "default"
          }
          onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        />
      ))}
      <Button
        title="Submit transport for verification"
        disabled={busy || loading}
        busy={busy}
        onPress={() => {
          void act(async () => {
            if (
              !Number.isInteger(Number(form.capacity)) ||
              Number(form.capacity) < 1 ||
              Number(form.capacity) > 1000 ||
              !Number.isFinite(Number(form.fare)) ||
              Number(form.fare) < 0
            )
              throw Error("Enter valid capacity and fare.");
            await rpc("save_transport", {
              eid: event.id,
              data: {
                ...form,
                capacity: Number(form.capacity),
                fare: Number(form.fare),
                departs_at: parseLocal(form.departs_at),
                returns_at: parseLocal(form.returns_at),
                booking_closes: parseLocal(form.booking_closes),
              },
            });
          });
        }}
      />
      {service && !service.cancelled && (
        <Button
          secondary
          title="Cancel transport service"
          disabled={busy}
          onPress={() =>
            confirm(
              "Cancel transport service",
              "This cancels all seat reservations and notifies passengers. Arrange refunds directly for any external payments.",
              () =>
                act(async () => {
                  await rpc("cancel_transport_service", { sid: service.id });
                }),
            )
          }
        />
      )}
      <Txt bold>Reserved seats · participant IDs</Txt>
      {bookings.map((b) => (
        <Txt key={b.user_id} size={12}>
          {b.user_id} · {b.seats} seats
        </Txt>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          secondary
          title="Previous"
          disabled={offset === 0 || loading}
          onPress={() => setOffset((n) => Math.max(0, n - 20))}
        />
        <Button
          secondary
          title="Next"
          disabled={!more || loading}
          onPress={() => setOffset((n) => n + 20)}
        />
      </View>
    </Panel>
  );
}
export function AdminTransport() {
  const [services, setServices] = useState<Service[]>([]),
    [evidence, setEvidence] = useState(""),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await db
        .from("transport_services")
        .select("*")
        .eq("cancelled", false)
        .order("verified")
        .order("updated_at")
        .order("id")
        .range(offset, offset + 20);
      if (error) throw error;
      setServices((data ?? []).slice(0, 20));
      setMore((data?.length ?? 0) > 20);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const verify = (s: Service, approved: boolean) =>
    confirm(
      approved
        ? "Verify provider and itinerary"
        : "Revoke transport verification",
      approved
        ? "Confirm you independently checked the provider, route, timetable, capacity and fare. Your evidence is recorded privately."
        : "This cancels reservations and notifies passengers.",
      async () => {
        setBusy(true);
        setError("");
        try {
          await rpc("verify_transport", { sid: s.id, approved, evidence });
          setEvidence("");
          await load();
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      },
    );
  return (
    <Panel>
      <Txt bold>Verify transport services</Txt>
      <Txt muted>
        Verification is an administrative review, not an automatic provider
        lookup. Check details directly with the operator before approving. MFA
        is enforced by the database.
      </Txt>
      <ErrorText text={error} />
      <Field
        label="Verification / revocation evidence (20+ characters, private)"
        multiline
        maxLength={2000}
        value={evidence}
        onChangeText={setEvidence}
      />
      <Button
        secondary
        title="Refresh transport queue"
        disabled={busy}
        onPress={() => {
          void load();
        }}
      />
      {services.map((s) => (
        <Panel key={s.id}>
          <Txt size={12}>
            Event: {s.event_id} · {s.verified ? "Verified" : "Pending"}
          </Txt>
          <ServiceInfo service={s} />
          <Txt>Capacity: {s.capacity}</Txt>
          <Button
            title={s.verified ? "Revoke verification" : "Verify transport"}
            disabled={busy || evidence.trim().length < 20}
            busy={busy}
            onPress={() => verify(s, !s.verified)}
          />
        </Panel>
      ))}
      <Button
        secondary
        title="Previous"
        disabled={offset === 0 || busy}
        onPress={() => setOffset((n) => Math.max(0, n - 20))}
      />
      <Button
        secondary
        title="Next"
        disabled={!more || busy}
        onPress={() => setOffset((n) => n + 20)}
      />
    </Panel>
  );
}

export function TransportHistory({
  openEvent,
}: {
  openEvent: (id: string) => void;
}) {
  const { session, revision } = useData(),
    { t, locale } = useI18n();
  const [items, setItems] = useState<{ booking: Booking; service: Service }[]>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false);
  const load = useCallback(async () => {
    setItems([]);
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const r = await db
        .from("transport_bookings")
        .select("*")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .order("service_id")
        .range(offset, offset + 20);
      if (r.error) throw r.error;
      const bookings = (r.data ?? []).slice(0, 20) as Booking[];
      setMore((r.data?.length ?? 0) > 20);
      if (bookings.length) {
        const s = await db
          .from("transport_services")
          .select("*")
          .in(
            "id",
            bookings.map((b) => b.service_id),
          );
        if (s.error) throw s.error;
        setItems(
          bookings.flatMap((booking) => {
            const service = s.data.find((s) => s.id === booking.service_id) as
              | Service
              | undefined;
            return service ? [{ booking, service }] : [];
          }),
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [session?.user.id, offset, revision]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Panel>
      <Txt translate bold>
        Transport reservations
      </Txt>
      <ErrorText text={error} />
      {busy && <Loading />}
      {items.map(({ booking: b, service: s }) => (
        <Panel key={s.id}>
          <ServiceInfo service={s} />
          <Txt>
            {t(b.status)} · {b.seats.toLocaleString(locale)} {t("Seats")}
          </Txt>
          <Button
            secondary
            title="Open event"
            onPress={() => openEvent(s.event_id)}
          />
          {b.status === "reserved" && (
            <Button
              secondary
              disabled={busy}
              title="Cancel seat reservation"
              onPress={() =>
                confirm(
                  t("Cancel seat reservation"),
                  t("Any payment refund must be arranged with the provider."),
                  async () => {
                    setBusy(true);
                    try {
                      await rpc("cancel_transport_booking", { sid: s.id });
                      await load();
                    } catch (e) {
                      setError(message(e));
                    } finally {
                      setBusy(false);
                    }
                  },
                )
              }
            />
          )}
        </Panel>
      ))}
      <Button
        secondary
        title="Refresh availability"
        disabled={busy}
        onPress={() => {
          void load();
        }}
      />
      <Button
        secondary
        title="Previous"
        disabled={busy || offset === 0}
        onPress={() => setOffset((n) => Math.max(0, n - 20))}
      />
      <Button
        secondary
        title="Next"
        disabled={busy || !more}
        onPress={() => setOffset((n) => n + 20)}
      />
    </Panel>
  );
}
