import React, { useEffect, useState } from "react";
import { useData } from "../context";
import { EventDetails, OrganizerDetails } from "../screens/Details";
import { Empty, Loading, Button, ErrorText } from "./UI";
export function CatalogueDetails({
  kind,
  id,
  openEvent,
  openOrganizer,
}: {
  kind: "event" | "organizer";
  id: string;
  openEvent: (id: string) => void;
  openOrganizer: (id: string) => void;
}) {
  const { ensureEvent, ensureOrganizer, revision } = useData();
  const [loading, setLoading] = useState(true),
    [found, setFound] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    (kind === "event" ? ensureEvent(id) : ensureOrganizer(id))
      .then((data) => {
        if (live) setFound(!!data);
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "Could not load details");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [kind, id, ensureEvent, ensureOrganizer, revision, retry]);
  if (loading) return <Loading />;
  if (error)
    return (
      <>
        <ErrorText text={error} />
        <Button title="Retry loading" onPress={() => setRetry((n) => n + 1)} />
      </>
    );
  if (!found) return <Empty text="This listing is unavailable." />;
  return kind === "event" ? (
    <EventDetails id={id} openOrganizer={openOrganizer} />
  ) : (
    <OrganizerDetails
      id={id}
      openEvent={openEvent}
      openOrganizer={openOrganizer}
    />
  );
}
