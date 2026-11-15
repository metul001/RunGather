import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { apiCategory, recordMetric } from "./performance";
import { AppState } from "react-native";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const configured = !!url && !!key && !url.includes("YOUR_PROJECT");
// Chunk auth sessions because platform keychain value limits vary. Each chunk is encrypted by SecureStore.
const storage = {
  async getItem(k: string) {
    const count = await SecureStore.getItemAsync(k + ".count");
    if (
      !count ||
      !Number.isInteger(Number(count)) ||
      Number(count) < 1 ||
      Number(count) > 128
    )
      return null;
    let value = "";
    for (let i = 0; i < Number(count); i++) {
      const chunk = await SecureStore.getItemAsync(k + "." + i);
      if (chunk === null) return null;
      value += chunk;
    }
    return value;
  },
  async setItem(k: string, value: string) {
    const previous = Number(
      (await SecureStore.getItemAsync(k + ".count")) ?? 0,
    );
    const points = Array.from(value);
    const n = Math.ceil(points.length / 450);
    if (n > 128) throw Error("Session is too large for secure storage.");
    for (let i = 0; i < n; i++)
      await SecureStore.setItemAsync(
        k + "." + i,
        points.slice(i * 450, (i + 1) * 450).join(""),
      );
    await SecureStore.setItemAsync(k + ".count", String(n));
    for (let i = n; i < previous; i++)
      await SecureStore.deleteItemAsync(k + "." + i);
  },
  async removeItem(k: string) {
    const n = Number((await SecureStore.getItemAsync(k + ".count")) ?? 0);
    await SecureStore.deleteItemAsync(k + ".count");
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(k + "." + i);
  },
};
export const db = createClient(
  configured ? url : "https://unconfigured.invalid",
  key || "unconfigured",
  {
    global: {
      fetch: async (input, init) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (init?.signal?.aborted) controller.abort();
        init?.signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, 20000);
        const start = Date.now();
        let ok = false;
        const name = apiCategory(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          init?.method,
        );
        try {
          const response = await fetch(input, {
            ...init,
            signal: controller.signal,
          });
          ok = response.ok;
          return response;
        } finally {
          recordMetric(name, Date.now() - start, ok);
          clearTimeout(timer);
          init?.signal?.removeEventListener("abort", abort);
        }
      },
    },
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);
AppState.addEventListener("change", (state) => {
  if (state === "active") db.auth.startAutoRefresh();
  else db.auth.stopAutoRefresh();
});
export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw Error(error.message);
  return data as T;
}
export async function rows<T>(
  table: string,
  filter?: { key: string; value: unknown },
): Promise<T[]> {
  let result: T[] = [];
  for (let start = 0; ; start += 500) {
    let q = db
      .from(table)
      .select("*")
      .order("id")
      .range(start, start + 499);
    if (filter) q = q.eq(filter.key, filter.value);
    const { data, error } = await q;
    if (error) throw Error(error.message);
    result.push(...(data as T[]));
    if (data.length < 500) return result;
  }
}
