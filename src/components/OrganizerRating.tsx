import React from "react";
import { Pressable, View } from "react-native";
import { Txt } from "./UI";
import { useI18n } from "../i18n";
import { ratingLabel } from "../domain";
export function OrganizerRating({
  name,
  score,
  count,
  verified = false,
  onPress,
}: {
  name: string;
  score: number | null | undefined;
  count: number;
  verified?: boolean;
  onPress?: () => void;
}) {
  const { language, t } = useI18n();
  const content = (
    <View style={{ gap: 2 }}>
      <Txt size={13} bold>
        {name}
        {verified ? " ✓" : ""}
      </Txt>
      <Txt size={12} muted>
        {score == null || count === 0
          ? t("Not yet rated")
          : language === "bn"
            ? `★ ${Number(score).toLocaleString("bn-BD", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/১০ · ${count.toLocaleString("bn-BD")}টি রিভিউ`
            : ratingLabel(score, count)}
      </Txt>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}
