export type MetricName =
  | "api.read"
  | "api.write"
  | "api.auth"
  | "api.storage"
  | "api.other"
  | "app.ready"
  | "search";
type Sample = { ms: number; ok: boolean };
const samples = new Map<MetricName, Sample[]>();
export function recordMetric(name: MetricName, ms: number, ok = true) {
  if (!Number.isFinite(ms) || ms < 0) return;
  const list = samples.get(name) ?? [];
  list.push({ ms: Math.round(ms), ok });
  if (list.length > 100) list.shift();
  samples.set(name, list);
}
export function apiCategory(url: string, method = "GET"): MetricName {
  // No raw URL, query, user ID, body or exception message is retained.
  try {
    const path = new URL(url).pathname;
    if (path.startsWith("/auth/")) return "api.auth";
    if (path.startsWith("/storage/")) return "api.storage";
    if (path.startsWith("/rest/") || path.startsWith("/functions/"))
      return method === "GET" ? "api.read" : "api.write";
  } catch {}
  return "api.other";
}
export function metricsSummary() {
  return [...samples.entries()].map(([name, list]) => {
    const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
    const percentile = (p: number) =>
      sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
    return {
      name,
      count: list.length,
      failed: list.filter((s) => !s.ok).length,
      p50: percentile(0.5),
      p95: percentile(0.95),
    };
  });
}
export function clearMetrics() {
  samples.clear();
}
export async function measured<T>(
  name: MetricName,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let ok = false;
  try {
    const value = await fn();
    ok = true;
    return value;
  } finally {
    recordMetric(name, Date.now() - start, ok);
  }
}
export const appStartedAt = Date.now();
