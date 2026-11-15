import React, { useState } from "react";
import { View } from "react-native";
import { OFFLINE_TTL, type SavedSnapshot } from "../offline";
import { useI18n } from "../i18n";
import { Txt, Panel, Button, Empty } from "./UI";
export function OfflineSaved({
  snapshot,
  clear,
}: {
  snapshot: SavedSnapshot | null;
  clear: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { t, locale } = useI18n();
  if (!snapshot || Date.now() - snapshot.syncedAt > OFFLINE_TTL)
    return (
      <Empty text="No offline copy yet. Connect and refresh Saved first." />
    );
  return (
    <View>
      <Panel>
        <Txt bold translate>
          Saved offline
        </Txt>
        <Txt translate muted>
          Offline copy — information may have changed.
        </Txt>
        <Txt>
          {new Date(snapshot.syncedAt).toLocaleString(locale, {
            timeZone: "Asia/Dhaka",
          })}{" "}
          · {snapshot.events.length}/20
        </Txt>
        <Txt muted>
          {t(
            "Offline copies contain text only. Connect to confirm event changes or make bookings.",
          )}
        </Txt>
        <Button secondary title="Clear offline copy" onPress={clear} />
      </Panel>
      <Txt muted>
        {t("Up to 20 saved events, text summaries only, kept for seven days.")}
      </Txt>
      {snapshot.events.map((e) => (
        <Panel key={e.id}>
          <Txt bold>{e.name}</Txt>
          <Txt>{e.organizer_name}</Txt>
          <Txt>
            {new Date(e.starts_at).toLocaleString(locale, {
              timeZone: "Asia/Dhaka",
            })}{" "}
            · {e.venue}
          </Txt>
          <Button
            secondary
            title={expanded === e.id ? "‹ Back" : "Open event"}
            onPress={() => setExpanded(expanded === e.id ? null : e.id)}
          />
          {expanded === e.id && (
            <>
              <Txt>{e.description}</Txt>
              <Txt>
                {e.address} · {e.district_name}, {e.division_name}
              </Txt>
              <Txt>{e.contact}</Txt>
              <Txt>{e.transport_details}</Txt>
              {e.cancelled && <Txt translate>cancelled</Txt>}
            </>
          )}
        </Panel>
      ))}
    </View>
  );
}
