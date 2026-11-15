import React, { useState } from "react";
import { Share } from "react-native";
import { metricsSummary, clearMetrics } from "../performance";
import { Txt, Panel, Button, ErrorText } from "./UI";
export function PerformancePanel() {
  const [metrics, setMetrics] = useState(metricsSummary),
    [error, setError] = useState("");
  return (
    <Panel>
      <Txt translate bold>
        Performance on this device
      </Txt>
      <Txt muted>
        Local session only. Last 100 samples per category; durations in ms. No
        identifiers, URLs or content are collected. Sharing opens your device’s
        share sheet.
      </Txt>
      {metrics.map((m) => (
        <Txt key={m.name}>
          {m.name}: n={m.count}, p50={m.p50} ms, p95={m.p95} ms, failed=
          {m.failed}
        </Txt>
      ))}
      <ErrorText text={error} />
      <Button
        secondary
        title="Refresh metrics"
        onPress={() => setMetrics(metricsSummary())}
      />
      <Button
        secondary
        title="Clear metrics"
        onPress={() => {
          clearMetrics();
          setMetrics([]);
        }}
      />
      <Button
        secondary
        title="Share performance summary"
        onPress={() => {
          void Share.share({
            message: JSON.stringify(
              { app: "RunGather", metrics: metricsSummary() },
              null,
              2,
            ),
          }).catch(() => setError("Could not open sharing."));
        }}
      />
    </Panel>
  );
}
