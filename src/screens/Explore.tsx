import React, { useState, useEffect } from "react";
import { View } from "react-native";
import { useData } from "../context";
import { defaultFilters } from "../domain";
import { EventCard } from "../components/EventCard";
import { Filters } from "../components/Filters";
import {
  Txt,
  Panel,
  Empty,
  Button,
  Loading,
  ErrorText,
} from "../components/UI";
import { OrganizerRating } from "../components/OrganizerRating";
import { OfflineSaved } from "../components/OfflineSaved";
import { useEventSearch } from "../useEventSearch";
import { useI18n } from "../i18n";
import { db } from "../supabase";
import type { Organizer } from "../types";
export function Explore({
  discover = false,
  savedOnly = false,
  openEvent,
  openOrganizer,
}: {
  discover?: boolean;
  savedOnly?: boolean;
  openEvent: (id: string) => void;
  openOrganizer: (id: string) => void;
}) {
  const { session, revision, snapshot, clearOffline, refresh } = useData(),
    { t, locale } = useI18n();
  const [f, setF] = useState({
      ...defaultFilters,
      period: savedOnly ? "all" : "upcoming",
    }),
    [debounced, setDebounced] = useState(f);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(f), 250);
    return () => clearTimeout(timer);
  }, [f]);
  const page = useEventSearch(
    { ...debounced, saved_only: savedOnly },
    revision,
    session?.user.id ?? "guest",
  );
  const [orgPage, setOrgPage] = useState(0),
    [orgs, setOrgs] = useState<Organizer[]>([]),
    [moreOrgs, setMoreOrgs] = useState(false),
    [orgError, setOrgError] = useState(""),
    [orgLoading, setOrgLoading] = useState(false);
  useEffect(() => setOrgPage(0), [debounced.query]);
  useEffect(() => {
    if (!discover) return;
    const controller = new AbortController();
    setOrgLoading(true);
    setOrgError("");
    const query = debounced.query.trim().replace(/[\\%_]/g, "\\$&");
    db.from("organizer_directory")
      .select("*")
      .ilike("name", `%${query}%`)
      .order("name")
      .order("id")
      .range(orgPage * 20, orgPage * 20 + 20)
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) setOrgError(error.message);
        else {
          setOrgs((data ?? []).slice(0, 20));
          setMoreOrgs((data?.length ?? 0) > 20);
        }
        setOrgLoading(false);
      });
    return () => controller.abort();
  }, [discover, debounced.query, orgPage, revision]);
  return (
    <View style={{ gap: 10 }}>
      <Txt translate bold size={30}>
        {savedOnly
          ? "Your race shortlist."
          : discover
            ? "Discover Bangladesh."
            : "More miles. More memories."}
      </Txt>
      <Txt translate muted>
        {savedOnly
          ? "Saved to your account across devices."
          : "Every starting line. One community."}
      </Txt>
      {!discover && !savedOnly && (
        <Panel>
          <Txt translate bold size={22}>
            Find your next starting line ↗
          </Txt>
          <Txt muted>
            {t("Explore approved events across all eight divisions.")}
          </Txt>
        </Panel>
      )}
      <Filters value={f} onChange={setF} />
      <ErrorText text={page.error} />
      {!!page.error && <Button title="Retry loading" onPress={page.reload} />}
      {page.loading ? (
        <Loading />
      ) : savedOnly && !session ? (
        <Empty text="Sign in from Profile to save events." />
      ) : page.items.length ? (
        <>
          <Txt>
            {(page.offset + 1).toLocaleString(locale)}–
            {(page.offset + page.items.length).toLocaleString(locale)}
          </Txt>
          {page.items.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              open={() => openEvent(e.id)}
              organizer={() => openOrganizer(e.organizer_id)}
            />
          ))}
        </>
      ) : (
        !page.error && (
          <Empty text="No matching events. Try clearing filters." />
        )
      )}
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
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
      {savedOnly && session && (
        <>
          <Button secondary title="Refresh saved copy" onPress={refresh} />
          <OfflineSaved
            snapshot={snapshot?.userId === session.user.id ? snapshot : null}
            clear={() => {
              void clearOffline().catch(() => {});
            }}
          />
        </>
      )}
      {discover && (
        <>
          <Txt translate bold size={24}>
            Organizer directory
          </Txt>
          <ErrorText text={orgError} />
          {orgLoading ? (
            <Loading />
          ) : (
            orgs.map((o) => (
              <Panel key={o.id}>
                <OrganizerRating
                  name={o.name}
                  score={o.average_rating}
                  count={o.review_count}
                  verified={o.verified}
                  onPress={() => openOrganizer(o.id)}
                />
              </Panel>
            ))
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              secondary
              title="Previous"
              disabled={orgPage === 0 || orgLoading}
              onPress={() => setOrgPage((n) => n - 1)}
            />
            <Button
              secondary
              title="More organizers"
              disabled={!moreOrgs || orgLoading}
              onPress={() => setOrgPage((n) => n + 1)}
            />
          </View>
        </>
      )}
    </View>
  );
}
