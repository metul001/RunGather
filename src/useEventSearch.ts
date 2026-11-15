import { useCallback, useEffect, useRef, useState } from "react";
import { searchEvents, type SearchPage } from "./catalogue";
import type { Filters } from "./domain";
export function useEventSearch(
  filters: Partial<Filters> & {
    saved_only?: boolean;
    organizer?: string;
    exclude_cancelled?: boolean;
  },
  revision = 0,
  scope = "public",
) {
  const [page, setPage] = useState<SearchPage>({
      items: [],
      has_more: false,
      offset: 0,
    }),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const key = JSON.stringify({ filters, scope }),
    epoch = useRef(0);
  // Filters and page belong to the same request key; never reuse a previous filter's offset.
  const [activeKey, setActiveKey] = useState(key);
  const effectiveOffset = activeKey === key ? offset : 0;
  useEffect(() => {
    if (activeKey !== key) {
      setActiveKey(key);
      setOffset(0);
    }
    const controller = new AbortController(),
      ticket = ++epoch.current;
    setLoading(true);
    setError("");
    setPage({ items: [], has_more: false, offset: effectiveOffset });
    searchEvents(JSON.parse(key).filters, effectiveOffset, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && ticket === epoch.current)
          setPage(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted && ticket === epoch.current)
          setError(e instanceof Error ? e.message : "Could not load events");
      })
      .finally(() => {
        if (!controller.signal.aborted && ticket === epoch.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [key, effectiveOffset, revision, retry]);
  return {
    ...(activeKey === key ? page : { items: [], has_more: false, offset: 0 }),
    loading: activeKey !== key || loading,
    error,
    next: () => setOffset(effectiveOffset + 20),
    previous: () => setOffset(Math.max(0, effectiveOffset - 20)),
    reload: useCallback(() => setRetry((n) => n + 1), []),
  };
}
