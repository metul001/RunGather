import React, { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { db, rpc } from "../supabase";
import { useData } from "../context";
import { useTheme } from "../theme";
import { Txt, Panel, Button, Field, ErrorText, Empty } from "../components/UI";
import { useI18n } from "../i18n";
import { TransportHistory } from "../components/TransportBooking";
import { PerformancePanel } from "../components/PerformancePanel";
import { OrganizerRating } from "../components/OrganizerRating";
import { Registration, Review } from "../types";
import { message, enablePush, signOutDevice } from "../actions";
export function ProfileScreen({
  openOrganizerDashboard,
  openAdmin,
  openEvent,
  reviewEvent,
}: {
  openOrganizerDashboard: () => void;
  openAdmin: () => void;
  openEvent: (id: string) => void;
  reviewEvent: (id: string) => void;
}) {
  const {
    session,
    profile,
    role,
    events,
    ensureEventBatch,
    revision,
    refresh,
    recovery,
    setRecovery,
  } = useData();
  const theme = useTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [registrations, setRegistrations] = useState<Registration[]>([]),
    [reviews, setReviews] = useState<Review[]>([]),
    [notifications, setNotifications] = useState<any[]>([]);
  const action = async (fn: () => Promise<void>) => {
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
  useEffect(() => {
    setName(profile?.display_name ?? "");
  }, [profile]);
  useEffect(() => {
    let live = true;
    setRegistrations([]);
    setReviews([]);
    setNotifications([]);
    if (!session) return;
    Promise.all([
      db
        .from("event_registrations")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("reviews")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("notifications")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]).then(([r, v, n]) => {
      if (!live) return;
      if (r.error || v.error || n.error) {
        setError((r.error || v.error || n.error)!.message);
        return;
      }
      setRegistrations(r.data);
      void ensureEventBatch([...new Set(r.data.map((x) => x.event_id))]).catch(
        () => {},
      );
      setReviews(v.data);
      setNotifications(n.data);
    });
    return () => {
      live = false;
    };
  }, [session?.user.id, ensureEventBatch, revision]);
  return (
    <View style={{ gap: 12 }}>
      <Txt translate bold size={30}>
        {session ? "Your running community." : "Welcome to RunGather."}
      </Txt>
      <Button
        secondary
        title={theme.dark ? "Switch to light mode" : "Switch to dark mode"}
        onPress={theme.toggle}
      />
      <PerformancePanel />
      <ErrorText text={error} />
      {!session ? (
        <Panel>
          <Txt translate bold size={22}>
            {mode === "signup"
              ? "Create your account"
              : mode === "reset"
                ? "Reset your password"
                : "Sign in"}
          </Txt>
          {mode === "signup" && (
            <Field
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {mode !== "reset" && (
            <Field
              label="Password (12+ characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />
          )}
          <Button
            title={
              mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset email"
                  : "Sign in"
            }
            disabled={busy}
            busy={busy}
            onPress={() =>
              action(async () => {
                if (mode === "reset") {
                  const { error } = await db.auth.resetPasswordForEmail(
                    email.trim(),
                    { redirectTo: "rungather://auth/reset" },
                  );
                  if (error) throw error;
                  Alert.alert(
                    "Check your email",
                    "If an account exists, a reset link will be sent.",
                  );
                  return;
                }
                if (mode === "signup") {
                  if (password.length < 12)
                    throw Error(
                      "Choose a password with at least 12 characters.",
                    );
                  const { error } = await db.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {
                      emailRedirectTo: "rungather://auth/callback",
                      data: { display_name: name.trim() || "Runner" },
                    },
                  });
                  if (error) throw error;
                  Alert.alert(
                    "Verify your email",
                    "Open the verification link on this device, then sign in.",
                  );
                  setMode("login");
                } else {
                  const { error } = await db.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                  });
                  if (error) throw error;
                }
                setPassword("");
              })
            }
          />
          <Button
            secondary
            title={mode === "signup" ? "Back to sign in" : "Create an account"}
            onPress={() => setMode(mode === "signup" ? "login" : "signup")}
          />
          <Button
            secondary
            title={mode === "reset" ? "Back to sign in" : "Forgot password?"}
            onPress={() => setMode(mode === "reset" ? "login" : "reset")}
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <Txt>{session.user.email}</Txt>
            <Field
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <Button
              title="Save profile"
              disabled={busy}
              busy={busy}
              onPress={() =>
                action(async () => {
                  await rpc("update_profile", { new_name: name });
                  await refresh();
                })
              }
            />
            {profile?.suspended && (
              <ErrorText text="This account is suspended. Contact platform support." />
            )}
            <Button
              secondary
              title="Organizer dashboard"
              onPress={openOrganizerDashboard}
            />
            {role === "admin" && (
              <Button
                secondary
                title="Administrator dashboard (MFA required)"
                onPress={openAdmin}
              />
            )}
            <Button
              secondary
              title="Enable event push notifications"
              disabled={busy}
              busy={busy}
              onPress={() =>
                action(async () => {
                  await enablePush(session.user.id);
                  Alert.alert(
                    "Notifications enabled",
                    "Event changes can now be delivered when the push service is configured.",
                  );
                })
              }
            />
            <Button
              secondary
              title="Sign out"
              disabled={busy}
              busy={busy}
              onPress={() =>
                action(async () => {
                  await signOutDevice();
                })
              }
            />
          </Panel>
          {recovery && (
            <Panel>
              <Txt translate bold>
                Choose a new password
              </Txt>
              <Field
                label="New password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Button
                title="Update password"
                disabled={busy}
                busy={busy}
                onPress={() =>
                  action(async () => {
                    if (password.length < 12)
                      throw Error("Use at least 12 characters.");
                    const { error } = await db.auth.updateUser({ password });
                    if (error) throw error;
                    setRecovery(false);
                    setPassword("");
                    Alert.alert("Password updated");
                  })
                }
              />
            </Panel>
          )}
          {role === "admin" && <MFAPanel />}
          <TransportHistory key={session.user.id} openEvent={openEvent} />
          <Txt translate bold size={22}>
            Registration history
          </Txt>
          {!registrations.length && (
            <Empty text="No registration records yet." />
          )}
          {registrations.map((r) => {
            const e = events.find((e) => e.id === r.event_id);
            return (
              <Panel key={r.id}>
                <Txt bold>{e?.name ?? "Event currently unavailable"}</Txt>
                <Txt size={12}>Participant ID: {r.user_id}</Txt>
                <Txt muted>
                  {t(r.status)}
                  {r.status === "interested"
                    ? " · External registration is not confirmed here."
                    : ""}
                </Txt>
                {e && (
                  <>
                    <OrganizerRating
                      name={e.organizer_name}
                      score={e.average_rating}
                      count={e.review_count}
                      verified={e.organizer_verified}
                    />
                    <Button
                      secondary
                      title="Open event"
                      onPress={() => openEvent(e.id)}
                    />
                  </>
                )}
                {r.status === "attended" && (
                  <Button
                    title="Write / update review"
                    onPress={() => reviewEvent(r.event_id)}
                  />
                )}
              </Panel>
            );
          })}
          <Txt translate bold size={22}>
            Your reviews
          </Txt>
          {reviews.map((r) => (
            <Panel key={r.id}>
              <Txt bold>
                {r.score}/10 · {r.moderation}
              </Txt>
              <Txt>{r.body}</Txt>
              <Button
                secondary
                title="Edit review"
                onPress={() => reviewEvent(r.event_id)}
              />
            </Panel>
          ))}
          <Txt translate bold size={22}>
            Notifications
          </Txt>
          <Txt translate muted>
            Most recent 100 updates
          </Txt>
          {!notifications.length && <Empty text="No event updates yet." />}
          {notifications.map((n) => (
            <Panel key={n.id}>
              <Txt bold>
                {n.title}
                {n.read_at ? "" : " · New"}
              </Txt>
              <Txt>{n.body}</Txt>
              {n.event_id && (
                <Button
                  secondary
                  title="View event"
                  onPress={() => openEvent(n.event_id)}
                />
              )}{" "}
              {!n.read_at && (
                <Button
                  secondary
                  title="Mark as read"
                  onPress={() =>
                    action(async () => {
                      const read_at = new Date().toISOString();
                      const { error } = await db
                        .from("notifications")
                        .update({ read_at })
                        .eq("id", n.id);
                      if (error) throw error;
                      setNotifications((old) =>
                        old.map((x) => (x.id === n.id ? { ...x, read_at } : x)),
                      );
                    })
                  }
                />
              )}
            </Panel>
          ))}
        </>
      )}
    </View>
  );
}
export function MFAPanel() {
  const { refresh } = useData();
  const [secret, setSecret] = useState(""),
    [factor, setFactor] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [verified, setVerified] = useState(false);
  useEffect(() => {
    db.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data }) => setVerified(data?.currentLevel === "aal2"));
    db.auth.mfa.listFactors().then(({ data }) => {
      const existing = data?.totp.find((x) => x.status === "verified");
      if (existing) setFactor(existing.id);
    });
  }, []);
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
    <Panel>
      <Txt translate bold>
        Administrator two-factor authentication
      </Txt>
      <Txt muted>
        {verified
          ? "MFA verified for this session."
          : "Use an authenticator app. Server permissions require MFA, even if the admin screen is opened directly."}
      </Txt>
      <ErrorText text={error} />
      {!verified && (
        <>
          {!factor && (
            <Button
              title="Set up authenticator"
              disabled={busy}
              busy={busy}
              onPress={() =>
                act(async () => {
                  const { data: existing } = await db.auth.mfa.listFactors();
                  for (const f of existing?.all ?? []) {
                    if (f.factor_type === "totp" && f.status === "unverified")
                      await db.auth.mfa.unenroll({ factorId: f.id });
                  }
                  const { data, error } = await db.auth.mfa.enroll({
                    factorType: "totp",
                    friendlyName: "RunGather admin",
                  });
                  if (error) throw error;
                  setSecret(data.totp.secret);
                  setFactor(data.id);
                })
              }
            />
          )}{" "}
          {!!secret && (
            <>
              <Txt translate muted>
                Add this setup key manually to your authenticator, then enter
                its six-digit code. Do not share the key.
              </Txt>
              <Txt>{secret}</Txt>
            </>
          )}{" "}
          {!!factor && (
            <>
              <Field
                label="Six-digit authenticator code"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              <Button
                title="Verify MFA"
                disabled={busy}
                busy={busy}
                onPress={() =>
                  act(async () => {
                    const { error } = await db.auth.mfa.challengeAndVerify({
                      factorId: factor,
                      code,
                    });
                    if (error) throw error;
                    setVerified(true);
                    setSecret("");
                    setCode("");
                    await refresh();
                  })
                }
              />
            </>
          )}
        </>
      )}
    </Panel>
  );
}
