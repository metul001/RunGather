import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { imageBytes } from "../_shared/image.ts";
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return new Response("{}", { status: 405, headers });
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return new Response('{"error":"Sign in required"}', {
        status: 401,
        headers,
      });
    const { error: limit } = await client.rpc("check_upload_permission");
    if (limit)
      return new Response(
        '{"error":"Upload not permitted or rate limit reached"}',
        { status: 403, headers },
      );
    const { bytes, mime, extension } = await imageBytes(req.body);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("event-images")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;
    return new Response(JSON.stringify({ path }), { headers });
  } catch {
    return new Response('{"error":"Image upload failed"}', {
      status: 400,
      headers,
    });
  }
});
