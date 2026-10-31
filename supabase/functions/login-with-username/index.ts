// Sign in with a username OR an email address.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, clientIp, corsHeaders, json, TOO_MANY } from "../_shared/http.ts";

const BAD_LOGIN = "اسم المستخدم/البريد أو كلمة المرور غير صحيحة";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  let body: { username?: string; identifier?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const identifier = String(body.identifier ?? body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!identifier || !password) return json({ error: "أدخل اسم المستخدم أو البريد وكلمة المرور" }, 400);

  // 30 tries / 15 min per IP, 8 tries / 15 min per account
  const ip = clientIp(req);
  if (!(await allow(admin, `login:ip:${ip}`, 30, 900))) return json({ error: TOO_MANY }, 429);
  if (!(await allow(admin, `login:id:${identifier}`, 8, 900))) return json({ error: TOO_MANY }, 429);

  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await admin.rpc("resolve_auth_username", { p_username: identifier });
    if (error || !data) return json({ error: BAD_LOGIN }, 401);
    email = data as string;
  }

  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json({ error: BAD_LOGIN }, 401);
  return json({ session: data.session });
});
