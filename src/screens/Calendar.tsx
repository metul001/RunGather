import React, { useState, useEffect } from "react";
import { View, Pressable } from "react-native";
import { db } from "../supabase";
import { useEventSearch } from "../useEventSearch";
import { useI18n } from "../i18n";
import { useData } from "../context";
import {
  defaultFilters,
  dhakaDate,
  monthDays,
  weekDays,
  moveMonth,
  shiftDate,
  filterEvents,
  countsByDate,
} from "../domain";
import {
  Txt,
  Button,
  Chips,
  Panel,
  Empty,
  Loading,
  ErrorText,
} from "../components/UI";
import { Filters } from "../components/Filters";
import { EventCard } from "../components/EventCard";
import { useTheme } from "../theme";
export function CalendarScreen({
  openEvent,
  openOrganizer,
}: {
  openEvent: (id: string) => void;
  openOrganizer: (id: string) => void;
}) {
  const { divisions, revision } = useData(),
    { colors } = useTheme();
  const { t, locale } = useI18n();
  const [date, setDate] = useState(dhakaDate()),
    [mode, setMode] = useState("month"),
    [f, setF] = useState({ ...defaultFilters, period: "all" });
  const [counts, setCounts] = useState<Record<string, number>>({}),
    [countError, setCountError] = useState(""),
    [countLoading, setCountLoading] = useState(false);
  const [debounced, setDebounced] = useState(f);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(f), 250);
    return () => clearTimeout(timer);
  }, [f]);
  const cells =
    mode === "month"
      ? monthDays(date)
      : mode === "week"
        ? weekDays(date)
        : [date];
  const days = cells.filter((d): d is string => d !== null),
    first = days[0],
    last = days[days.length - 1];
  useEffect(() => {
    const controller = new AbortController();
    setCountLoading(true);
    setCountError("");
    setCounts({});
    db.rpc("calendar_counts", {
      filters: debounced,
      first_day: first,
      last_day: last,
    })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) setCountError(error.message);
        else
          setCounts(
            Object.fromEntries(
              (data ?? []).map((r: { day: string; total: number }) => [
                r.day,
                Number(r.total),
              ]),
            ),
          );
        setCountLoading(false);
      });
    return () => controller.abort();
  }, [first, last, debounced, revision]);
  const page = useEventSearch(
    { ...debounced, date, exclude_cancelled: true },
    revision,
  );
  const selected = page.items;
  const move = (delta: number) =>
    setDate(
      mode === "month"
        ? moveMonth(date, delta)
        : shiftDate(date, delta * (mode === "week" ? 7 : 1)),
    );
  return (
    <View style={{ gap: 10 }}>
      <Txt translate bold size={30}>
        Your event calendar.
      </Txt>
      <Txt muted translate>
        Bangladesh time · Counts reflect the current filters. Cancelled events
        are excluded.
      </Txt>
      <Filters value={f} onChange={setF} calendar />
      <Chips
        items={["month", "week", "day"].map((id) => ({
          id,
          name: t(id[0].toUpperCase() + id.slice(1)),
        }))}
        value={mode}
        onChange={setMode}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Button title="‹" secondary onPress={() => move(-1)} />
        <Txt bold size={20}>
          {date.slice(0, 7)}
        </Txt>
        <Button title="›" secondary onPress={() => move(1)} />
      </View>
      <Button title="Today" secondary onPress={() => setDate(dhakaDate())} />
      <ErrorText text={countError} />
      {countLoading && <Loading />}
      <Panel>
        {mode !== "day" && (
          <View style={{ flexDirection: "row" }}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <View key={d} style={{ width: "14.28%", alignItems: "center" }}>
                <Txt muted size={11}>
                  {t(d)}
                </Txt>
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((day, i) => (
            <Pressable
              key={day ?? "empty" + i}
              accessibilityRole="button"
              disabled={!day}
              accessibilityLabel={
                day ? `${day}, ${counts[day] ?? 0} events` : undefined
              }
              onPress={() => day && setDate(day)}
              style={{
                width: mode === "day" ? "100%" : "14.28%",
                minHeight: 60,
                padding: 3,
              }}
            >
              {day && (
                <View
                  style={{
                    flex: 1,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: day === date ? 2 : 0,
                    borderColor: colors.accent,
                    backgroundColor:
                      (counts[day] ?? 0) >= 4
                        ? colors.bg === "#101d18"
                          ? "#315d3e"
                          : "#d4f487"
                        : (counts[day] ?? 0) > 0
                          ? colors.bg === "#101d18"
                            ? "#243e2d"
                            : "#dde9d3"
                          : colors.card,
                  }}
                >
                  <Txt size={12}>{day.slice(-2)}</Txt>
                  <TextCount count={counts[day] ?? 0} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
        <Txt translate muted size={11}>
          Light green: 1–3 events · Lime: 4+ events
        </Txt>
      </Panel>
      <Txt bold size={22}>
        {date} · {selected.length.toLocaleString(locale)}{" "}
        {t("Events on this page")}
      </Txt>
      <ErrorText text={page.error} />
      {page.loading && <Loading />}
      {divisions
        .filter((d) => !f.division || d.id === f.division)
        .map((d) => {
          const group = selected.filter((e) => e.division_id === d.id);
          return (
            <View key={d.id}>
              <Txt bold>
                {t(d.name)} · {group.length.toLocaleString(locale)}
              </Txt>
              {group.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  open={() => openEvent(e.id)}
                  organizer={() => openOrganizer(e.organizer_id)}
                />
              ))}
            </View>
          );
        })}
      {!page.loading && !page.error && !selected.length && (
        <Empty text="No approved events match this date and your filters." />
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
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
    </View>
  );
}
function TextCount({ count }: { count: number }) {
  const { language, locale } = useI18n();
  return (
    <Txt size={10} muted>
      {count
        ? language === "bn"
          ? `${count.toLocaleString(locale)}টি ইভেন্ট`
          : `${count} event${count === 1 ? "" : "s"}`
        : "—"}
    </Txt>
  );
}
