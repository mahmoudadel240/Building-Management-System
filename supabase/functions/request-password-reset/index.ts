// Send a password-reset link to the account's email, by username or email.
// Always answers with the same message so it can't be used to discover accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, clientIp, corsHeaders, json, TOO_MANY } from "../_shared/http.ts";

const REDIRECT_TO = "https://building-management-system-one.vercel.app";
const GENERIC = { sent: true, message: "لو الحساب مرتبط ببريد إلكتروني، هيوصله رابط إعادة التعيين." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  let body: { username?: string; identifier?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const identifier = String(body.identifier ?? body.username ?? "").trim().toLowerCase();
  if (!identifier) return json({ error: "اكتب اسم المستخدم أو البريد الأول" }, 400);

  // 5 requests / hour per IP, 3 / hour per account
  const ip = clientIp(req);
  if (!(await allow(admin, `reset:ip:${ip}`, 5, 3600))) return json({ error: TOO_MANY }, 429);
  if (!(await allow(admin, `reset:id:${identifier}`, 3, 3600))) return json({ error: TOO_MANY }, 429);

  let email: string | null = identifier.includes("@") ? identifier : null;
  if (!email) {
    const { data } = await admin.rpc("resolve_auth_username", { p_username: identifier });
    email = (data as string) || null;
  }
  // Accounts created without an email get an internal placeholder address — nothing to send to.
  if (!email || email.endsWith("@username.invalid")) return json(GENERIC);

  const auth = createClient(url, anon, { auth: { persistSession: false } });
  await auth.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_TO });
  return json(GENERIC);
});
