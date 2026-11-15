import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useData } from "../context";
import { db, rpc, rows } from "../supabase";
import {
  Txt,
  Panel,
  Button,
  Field,
  Chips,
  ErrorText,
  Empty,
  Loading,
} from "../components/UI";
import { AdminTransport } from "../components/TransportBooking";
import { OrganizerRating } from "../components/OrganizerRating";
import { MFAPanel } from "./Profile";
import { message, confirm } from "../actions";
const resources = {
  organizer: "organizers",
  event: "events",
  review: "reviews",
  verification: "organizer_verifications",
  report: "reports",
  user: "profiles",
  audit: "admin_audit_logs",
};
export function AdminDashboard() {
  const { role, refresh } = useData();
  const [allowed, setAllowed] = useState(false),
    [tab, setTab] = useState<keyof typeof resources>("organizer"),
    [items, setItems] = useState<any[]>([]),
    [ratings, setRatings] = useState<any[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [label, setLabel] = useState(""),
    [kind, setKind] = useState("category"),
    [refId, setRefId] = useState(""),
    [parent, setParent] = useState(""),
    [stats, setStats] = useState<Record<string, number>>({});
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } =
        await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (data.currentLevel !== "aal2") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const [list, r] = await Promise.all([
        rows<any>(resources[tab]),
        db.from("organizer_ratings").select("*"),
      ]);
      if (r.error) throw r.error;
      setItems(list);
      setRatings(r.data);
      const counts: Record<string, number> = {};
      for (const table of [
        "profiles",
        "organizers",
        "events",
        "reviews",
        "reports",
      ]) {
        const { count, error } = await db
          .from(table)
          .select("*", { count: "exact", head: true });
        if (error) throw error;
        counts[table] = count ?? 0;
      }
      setStats(counts);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (role === "admin") load();
  }, [role, tab]);
  if (role !== "admin")
    return <Empty text="Administrator access is required." />;
  const act = (action_name: string, target: string, decision?: string) =>
    confirm(
      "Administrative action",
      `${action_name}${decision ? ": " + decision : ""}. This action is recorded in the audit log.`,
      async () => {
        setBusy(true);
        try {
          await rpc("admin_action", {
            action_name,
            target,
            decision: decision ?? null,
          });
          await load();
          await refresh();
        } finally {
          setBusy(false);
        }
      },
    );
  return (
    <View style={{ gap: 12 }}>
      <Txt bold size={28}>
        Platform administration.
      </Txt>
      <ErrorText text={error} />
      {!allowed ? (
        <>
          <MFAPanel />
          <Button title="Recheck administrator access" onPress={load} />
        </>
      ) : (
        <>
          <Panel>
            <AdminTransport />
            <Txt bold>Platform statistics</Txt>
            {Object.entries(stats).map(([key, n]) => (
              <Txt key={key}>
                {key}: {n}
              </Txt>
            ))}
          </Panel>
          <Chips
            items={Object.keys(resources).map((id) => ({
              id: id as keyof typeof resources,
              name: id[0].toUpperCase() + id.slice(1),
            }))}
            value={tab}
            onChange={setTab}
          />
          <Button secondary title="Refresh queue" onPress={load} />
          {loading ? (
            <Loading />
          ) : (
            items.map((item) => (
              <Panel key={item.id}>
                {tab === "organizer" ? (
                  <OrganizerRating
                    name={item.name}
                    score={
                      ratings.find((r) => r.organizer_id === item.id)
                        ?.average_rating
                    }
                    count={
                      ratings.find((r) => r.organizer_id === item.id)
                        ?.review_count ?? 0
                    }
                    verified={item.verified}
                  />
                ) : (
                  <Txt bold>
                    {item.name ??
                      item.display_name ??
                      item.title ??
                      item.action ??
                      item.author_name ??
                      item.id}
                  </Txt>
                )}
                <Txt muted>
                  {item.approval ??
                    item.moderation ??
                    item.status ??
                    item.created_at}
                </Txt>
                {[
                  "description",
                  "body",
                  "evidence",
                  "reason",
                  "contact",
                  "website",
                  "social_url",
                  "address",
                  "target_type",
                  "target_id",
                  "user_id",
                  "admin_id",
                  "event_id",
                  "organizer_id",
                ]
                  .filter((k) => item[k])
                  .map((k) => (
                    <Txt key={k} size={13}>
                      {k}: {String(item[k])}
                    </Txt>
                  ))}
                {["organizer", "event", "review", "verification"].includes(
                  tab,
                ) && (
                  <View style={{ gap: 8 }}>
                    <Button
                      title="Approve"
                      disabled={busy}
                      busy={busy}
                      onPress={() => act(tab, item.id, "approved")}
                    />
                    <Button
                      secondary
                      title="Reject / hide"
                      disabled={busy}
                      busy={busy}
                      onPress={() => act(tab, item.id, "rejected")}
                    />
                  </View>
                )}
                {tab === "organizer" && (
                  <Button
                    secondary
                    title={
                      item.suspended ? "Restore organizer" : "Suspend organizer"
                    }
                    disabled={busy}
                    busy={busy}
                    onPress={() =>
                      act(
                        item.suspended
                          ? "restore_organizer"
                          : "suspend_organizer",
                        item.id,
                      )
                    }
                  />
                )}{" "}
                {tab === "user" && (
                  <Button
                    secondary
                    title={
                      item.suspended ? "Restore account" : "Suspend account"
                    }
                    disabled={busy}
                    busy={busy}
                    onPress={() =>
                      act(
                        item.suspended ? "restore_user" : "suspend_user",
                        item.id,
                      )
                    }
                  />
                )}{" "}
                {tab === "report" && (
                  <>
                    <Button
                      title="Resolve report"
                      disabled={busy}
                      busy={busy}
                      onPress={() => act("report", item.id, "resolved")}
                    />
                    <Button
                      secondary
                      title="Dismiss report"
                      disabled={busy}
                      busy={busy}
                      onPress={() => act("report", item.id, "dismissed")}
                    />
                  </>
                )}
              </Panel>
            ))
          )}
          {!loading && !items.length && (
            <Empty text="Nothing in this section." />
          )}
          <Panel>
            <Txt bold>Categories & locations</Txt>
            <Txt muted>
              Reference IDs are listed below. Changing a district’s division is
              intentionally prohibited to preserve existing event location
              relationships.
            </Txt>
            <Chips
              items={["category", "district", "division"].map((id) => ({
                id,
                name: id,
              }))}
              value={kind}
              onChange={setKind}
            />
            <Field
              label="Reference ID (blank creates a category)"
              keyboardType="number-pad"
              value={refId}
              onChangeText={setRefId}
            />
            <Field label="Display name" value={label} onChangeText={setLabel} />
            {kind === "district" && (
              <Field
                label="Division ID"
                value={parent}
                onChangeText={setParent}
                keyboardType="number-pad"
              />
            )}
            <Button
              title="Save reference"
              disabled={busy}
              busy={busy}
              onPress={() =>
                confirm(
                  "Update reference data",
                  "This affects event filters and is recorded in the audit log.",
                  async () => {
                    await rpc("admin_reference", {
                      kind,
                      ref_id: refId ? Number(refId) : null,
                      label,
                      parent_id: parent ? Number(parent) : null,
                    });
                    await refresh();
                    await load();
                  },
                )
              }
            />
            <ReferenceList />
          </Panel>
        </>
      )}
    </View>
  );
}
function ReferenceList() {
  const { divisions, districts, categories } = useData();
  return (
    <>
      <Txt bold>Categories</Txt>
      <Txt size={12}>
        {categories.map((x) => `${x.id}: ${x.name}`).join(" · ")}
      </Txt>
      <Txt bold>Divisions</Txt>
      <Txt size={12}>
        {divisions.map((x) => `${x.id}: ${x.name}`).join(" · ")}
      </Txt>
      <Txt bold>Districts</Txt>
      <Txt size={12}>
        {districts
          .map((x) => `${x.id}: ${x.name} (division ${x.division_id})`)
          .join(" · ")}
      </Txt>
    </>
  );
}
