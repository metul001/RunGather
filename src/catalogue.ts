import { db } from "./supabase";
import { measured } from "./performance";
import type { Event } from "./types";
import type { Filters } from "./domain";
export type SearchPage = { items: Event[]; has_more: boolean; offset: number };
export async function searchEvents(
  filters: Partial<Filters> & {
    saved_only?: boolean;
    organizer?: string;
    exclude_cancelled?: boolean;
  },
  offset = 0,
  signal?: AbortSignal,
): Promise<SearchPage> {
  return measured("search", async () => {
    let query = db.rpc("search_events", {
      filters,
      page_offset: offset,
      page_size: 20,
    });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw Error(error.message);
    return data as SearchPage;
  });
}
