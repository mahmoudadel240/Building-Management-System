// Create a user (with or without email) and attach them to a building.
// Owner/superuser can create residents, admins and (owner only) superusers; an approved
// building admin can create residents for their own building.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, corsHeaders, json, TOO_MANY } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
  if (authError || !caller) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, service);
  // 30 accounts / hour per caller
  if (!(await allow(admin, `invite:${caller.id}`, 30, 3600))) return json({ error: TOO_MANY }, 429);

  const { data: profile } = await admin.from("profiles").select("role").eq("id", caller.id).single();
  if (!profile) return json({ error: "Profile not found" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { username, email, password, building_id, member_role = "resident" } = body as {
    username?: string; email?: string | null; password?: string | null; building_id?: string | null; member_role?: string;
  };

  const clean = String(username || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(clean)) {
    return json({ error: "اسم المستخدم لازم يكون من 3 إلى 32 حرف (حروف إنجليزي، أرقام، . _ -)" }, 400);
  }
  if (!["resident", "admin", "superuser"].includes(member_role)) return json({ error: "Invalid role" }, 400);

  const privileged = ["owner", "superuser"].includes(profile.role);
  if (!privileged && !(profile.role === "admin" && member_role === "resident" && building_id)) {
    return json({ error: "Forbidden" }, 403);
  }
  if (member_role === "superuser" && profile.role !== "owner") return json({ error: "Only owner can create superuser" }, 403);
  if (member_role !== "superuser" && !building_id) return json({ error: "اختار العمارة" }, 400);

  if (!privileged) {
    const { data: m } = await admin.from("building_members").select("id")
      .eq("building_id", building_id).eq("user_id", caller.id)
      .eq("member_role", "admin").eq("status", "approved").maybeSingle();
    if (!m) return json({ error: "Not an approved admin of this building" }, 403);
  }

  const { data: existing } = await admin.from("profiles").select("id").ilike("username", clean).maybeSingle();
  if (existing) return json({ error: "اسم المستخدم مستخدم بالفعل" }, 409);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Invalid email" }, 400);
  if (!email && (!password || password.length < 8)) {
    return json({ error: "لازم كلمة مرور 8 حروف على الأقل لو مفيش بريد" }, 400);
  }

  const authEmail = email || "u_" + crypto.randomUUID().replaceAll("-", "") + "@username.invalid";
  let created;
  if (email) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { username: clean } });
    if (error || !data.user) return json({ error: error?.message || "Invitation failed" }, 400);
    created = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: authEmail, password: password!, email_confirm: true, user_metadata: { username: clean },
    });
    if (error || !data.user) return json({ error: error?.message || "Account creation failed" }, 400);
    created = data.user;
  }

  const { error: pe } = await admin.from("profiles").upsert({
    id: created.id, email: email || null, username: clean, display_name: clean,
    role: member_role === "superuser" ? "superuser" : "resident",
  }, { onConflict: "id" });
  if (pe) { await admin.auth.admin.deleteUser(created.id); return json({ error: pe.message }, 400); }

  if (member_role !== "superuser") {
    const { error } = await admin.from("building_members").insert({
      building_id, user_id: created.id, member_role, status: "approved",
      approved_by: caller.id, approved_at: new Date().toISOString(),
    });
    if (error) { await admin.auth.admin.deleteUser(created.id); return json({ error: error.message }, 400); }
  }

  return json({
    user_id: created.id, username: clean, email: email || null, member_role,
    invited: Boolean(email), created_without_email: !email,
  });
});
