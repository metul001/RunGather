import React from "react";
import { Pressable, View } from "react-native";
import { Event } from "../types";
import { AssetImage, Panel, Txt, Button } from "./UI";
import { OrganizerRating } from "./OrganizerRating";
import { useI18n } from "../i18n";
import { dhakaDate } from "../domain";
export function EventCard({
  event: e,
  open,
  organizer,
}: {
  event: Event;
  open: () => void;
  organizer: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Panel>
      <Pressable accessibilityRole="button" onPress={open}>
        <AssetImage path={e.cover_path} />
        <View style={{ marginTop: 13, gap: 6 }}>
          <Txt muted size={12}>
            {dhakaDate(e.starts_at)} · {t(e.division_name)} · {t(e.status)}
          </Txt>
          <Txt bold size={21}>
            {e.name}
          </Txt>
          <Txt muted size={13}>
            {e.venue} · {t(e.category_name)}
          </Txt>
        </View>
      </Pressable>
      <OrganizerRating
        name={e.organizer_name}
        score={e.average_rating}
        count={e.review_count}
        verified={e.organizer_verified}
        onPress={organizer}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Txt bold>
          {Number(e.price) === 0
            ? t("Free entry")
            : `৳${Number(e.price).toLocaleString(locale)}`}
        </Txt>
        <Button secondary title="View event ↗" onPress={open} />
      </View>
    </Panel>
  );
}
