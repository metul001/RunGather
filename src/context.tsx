import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { db, configured, rows } from "./supabase";
import { offlineCache } from "./offlineStore";
import type { SavedSnapshot } from "./offline";
import type { Event, Organizer, Profile, Reference } from "./types";
type State = {
  events: Event[];
  revision: number;
  ensureEvent: (id: string) => Promise<Event | null>;
  ensureOrganizer: (id: string) => Promise<Organizer | null>;
  ensureEventBatch: (ids: string[]) => Promise<void>;
  snapshot: SavedSnapshot | null;
  clearOffline: () => Promise<void>;
  organizers: Organizer[];
  divisions: Reference[];
  districts: Reference[];
  categories: Reference[];
  session: Session | null;
  profile: Profile | null;
  role: string;
  saved: string[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  recovery: boolean;
  setRecovery: (v: boolean) => void;
};
const Context = createContext<State>(null!);
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]),
    [organizers, setOrganizers] = useState<Organizer[]>([]),
    [divisions, setDivisions] = useState<Reference[]>([]),
    [districts, setDistricts] = useState<Reference[]>([]),
    [categories, setCategories] = useState<Reference[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [role, setRole] = useState("user"),
    [saved, setSaved] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState(false);
  const epoch = useRef(0);
  const account = useRef<string | null>(null);
  const [revision, setRevision] = useState(0),
    [snapshot, setSnapshot] = useState<SavedSnapshot | null>(null);
  const ensureEvent = useCallback(async (id: string) => {
    const user = account.current;
    const { data, error } = await db
      .from("event_directory")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw Error(error.message);
    if (user === account.current && data)
      setEvents((old) => [...old.filter((e) => e.id !== id).slice(-199), data]);
    return data as Event | null;
  }, []);
  const ensureOrganizer = useCallback(async (id: string) => {
    const user = account.current;
    const { data, error } = await db
      .from("organizer_directory")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw Error(error.message);
    if (user === account.current && data)
      setOrganizers((old) => [
        ...old.filter((o) => o.id !== id).slice(-79),
        data,
      ]);
    return data as Organizer | null;
  }, []);
  const ensureEventBatch = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const user = account.current;
    const { data, error } = await db
      .from("event_directory")
      .select("*")
      .in("id", ids.slice(0, 50));
    if (error) throw Error(error.message);
    if (user === account.current && data)
      setEvents((old) => {
        const merged = new Map(old.map((e) => [e.id, e]));
        for (const e of data) merged.set(e.id, e);
        return [...merged.values()].slice(-200);
      });
  }, []);
  const clearOffline = useCallback(async () => {
    setSnapshot(null);
    if (session) await offlineCache.clear(session.user.id);
  }, [session?.user.id]);
  useEffect(() => {
    const user = session?.user.id ?? null;
    let live = true;
    setSnapshot(null);
    if (account.current !== user) {
      ++epoch.current;
      setEvents([]);
      setOrganizers([]);
      setSaved([]);
      setProfile(null);
      setRole("user");
      if (account.current)
        void offlineCache.clear(account.current).catch(() => {});
      account.current = user;
    }
    if (user)
      offlineCache
        .load(user)
        .then((s) => {
          if (live) setSnapshot(s);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [session?.user.id]);
  const references = useRef<{
    expires: number;
    data: [Reference[], Reference[], Reference[]];
  } | null>(null);
  const refresh = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const ticket = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const referenceRequest =
        references.current && references.current.expires > Date.now()
          ? Promise.resolve(references.current.data)
          : Promise.all([
              rows<Reference>("divisions"),
              rows<Reference>("districts"),
              rows<Reference>("categories"),
            ]).then((data) => {
              references.current = { expires: Date.now() + 5 * 60000, data };
              return data;
            });
      const [d, di, c] = await referenceRequest;
      let p: Profile | null = null,
        r = "user",
        s: string[] = [];
      if (session) {
        const [pr, rr, sr] = await Promise.all([
          db.from("profiles").select("*").eq("id", session.user.id).single(),
          db
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .single(),
          db
            .from("saved_events")
            .select("event_id")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false }),
        ]);
        if (pr.error) throw pr.error;
        if (rr.error) throw rr.error;
        if (sr.error) throw sr.error;
        p = pr.data;
        r = rr.data.role;
        s = sr.data.map((x) => x.event_id);
      }
      if (ticket !== epoch.current) return;
      setRevision((n) => n + 1);
      setDivisions(d);
      setDistricts(di);
      setCategories(c);
      setProfile(p);
      setRole(r);
      setSaved(s);
      if (session) {
        const user = session.user.id;
        const { data, error: cacheError } = s.length
          ? await db
              .from("event_directory")
              .select("*")
              .in("id", s.slice(0, 20))
          : { data: [], error: null };
        if (!cacheError && ticket === epoch.current) {
          const copy = await offlineCache
            .save(user, data as Event[])
            .catch(() => null);
          if (copy && ticket === epoch.current && account.current === user)
            setSnapshot(copy);
        }
      }
    } catch (e) {
      if (ticket === epoch.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not load events. Please retry.",
        );
    } finally {
      if (ticket === epoch.current) setLoading(false);
    }
  }, [session?.user.id]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!configured) return;
    db.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!next) {
        ++epoch.current;
        setProfile(null);
        setSaved([]);
        setRole("user");
      }
    });
    const handle = async (url: string) => {
      try {
        const parsed = Linking.parse(url);
        if (
          parsed.scheme !== "rungather" ||
          parsed.hostname !== "auth" ||
          !["reset", "callback"].includes(parsed.path ?? "")
        )
          return;
        const code = parsed.queryParams?.code;
        if (typeof code === "string") {
          const { error } = await db.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (parsed.path === "reset") setRecovery(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in link failed");
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const link = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => {
      subscription.unsubscribe();
      link.remove();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        events,
        revision,
        ensureEventBatch,
        ensureEvent,
        ensureOrganizer,
        snapshot,
        clearOffline,
        organizers,
        divisions,
        districts,
        categories,
        session,
        profile: profile?.id === session?.user.id ? profile : null,
        role: account.current === session?.user.id ? role : "user",
        saved: account.current === session?.user.id ? saved : [],
        loading,
        error,
        refresh,
        recovery,
        setRecovery,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useData = () => useContext(Context);
