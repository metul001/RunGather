import { createClient } from "npm:@supabase/supabase-js@2.95.3";
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
Deno.serve(async (req) => {
  const secret = Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";
  if (
    req.method !== "POST" ||
    secret.length < 32 ||
    !equal(req.headers.get("X-Dispatch-Secret") ?? "", secret)
  )
    return new Response("Unauthorized", { status: 401 });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;
  try {
    const { data: pending, error: receiptError } = await client.rpc(
      "pending_push_receipts",
    );
    if (receiptError) throw receiptError;
    if (pending?.length) {
      const response = await fetch(
        "https://exp.host/--/api/v2/push/getReceipts",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids: pending.map((p: any) => p.ticket_id) }),
        },
      );
      if (response.ok) {
        const result = await response.json();
        for (const p of pending) {
          const receipt = result.data?.[p.ticket_id];
          if (receipt) {
            const { error } = await client.rpc("finish_push_receipt", {
              ticket: p.ticket_id,
              error_text:
                receipt.status === "ok"
                  ? null
                  : (receipt.details?.error ?? "Delivery failed"),
            });
            if (error) throw error;
          }
        }
      }
    }
    const { data: jobs, error } = await client.rpc("claim_push_batch");
    if (error) throw error;
    let sent = 0;
    for (const job of jobs ?? []) {
      let failure: string | null = null;
      try {
        const { data: devices, error } = await client
          .from("push_tokens")
          .select("token")
          .eq("user_id", job.user_id);
        if (error) throw error;
        for (let offset = 0; offset < (devices?.length ?? 0); offset += 100) {
          const batch = devices!.slice(offset, offset + 100);
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers,
            body: JSON.stringify(
              batch.map((d) => ({
                to: d.token,
                sound: "default",
                channelId: "default",
                title: "RunGather event update",
                body: "An event you follow has an update. Open RunGather for details.",
              })),
            ),
          });
          if (!response.ok) throw Error("Push provider unavailable");
          const result = await response.json();
          if (
            !Array.isArray(result.data) ||
            result.data.length !== batch.length
          )
            throw Error("Invalid provider response");
          for (let i = 0; i < batch.length; i++) {
            const ticket = result.data[i];
            if (ticket.status === "ok") {
              const { error } = await client.rpc("record_push_ticket", {
                ticket: ticket.id,
                device_token: batch[i].token,
              });
              if (error) throw error;
              sent++;
            } else if (ticket.details?.error === "DeviceNotRegistered") {
              const { error } = await client
                .from("push_tokens")
                .delete()
                .eq("token", batch[i].token);
              if (error) throw error;
            } else throw Error("Push ticket rejected");
          }
        }
      } catch {
        failure = "Push request failed; retry scheduled";
      }
      const { error } = await client.rpc("finish_push_job", {
        job: job.job_id,
        error_text: failure,
      });
      if (error) throw error;
    }
    return Response.json({ processed: jobs?.length ?? 0, accepted: sent });
  } catch {
    return new Response("Dispatch failed", { status: 500 });
  }
});
