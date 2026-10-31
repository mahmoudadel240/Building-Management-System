// Shared helpers for the Edge Functions: CORS, JSON replies, client IP and rate limiting.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.headers.get("cf-connecting-ip") ||
  "unknown";

// Returns true when the action is allowed. Fails closed if the limiter itself errors.
export async function allow(admin: SupabaseClient, key: string, max: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) return false;
  return data === true;
}

export const TOO_MANY = "محاولات كثيرة. حاول مرة أخرى بعد قليل.";
