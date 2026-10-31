// Manage an existing account: edit it, remove it, link it to apartments, make it a building admin.
//
// Who can do what
// - owner: anyone except themselves being removed; superusers included
// - superuser: anyone except the owner and other superusers
// - building admin: residents of their own building (not admins or superusers), link to
//   apartments of their building; cannot make admins
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, corsHeaders, json, TOO_MANY } from "../_shared/http.ts";

type Body = {
  action?: "update" | "disable" | "link" | "make_admin";
  user_id?: string;
  display_name?: string; username?: string; phone?: string | null; email?: string | null; password?: string | null;
  building_id?: string; apartment_ids?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
  if (authError || !caller) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, service);
  if (!(await allow(admin, `manage:${caller.id}`, 60, 3600))) return json({ error: TOO_MANY }, 429);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { action, user_id } = body;
  if (!action || !user_id) return json({ error: "Invalid request" }, 400);

  const { data: me } = await admin.from("profiles").select("id, role").eq("id", caller.id).single();
  const { data: target } = await admin.from("profiles").select("id, role, email, username, disabled_at").eq("id", user_id).single();
  if (!me || !target || target.disabled_at) return json({ error: "المستخدم مش موجود" }, 404);

  const privileged = ["owner", "superuser"].includes(me.role);
  const { data: myAdminRows } = await admin.from("building_members").select("building_id")
    .eq("user_id", caller.id).eq("member_role", "admin").eq("status", "approved");
  const myBuildings = new Set((myAdminRows || []).map((r) => r.building_id));
  const canManageBuilding = (bid?: string | null) => !!bid && (privileged || myBuildings.has(bid));

  // Buildings the target belongs to (membership or an approved/pending apartment link)
  const { data: tm } = await admin.from("building_members").select("building_id, member_role").eq("user_id", user_id).eq("status", "approved");
  const { data: tl } = await admin.from("apartment_residents").select("apartment_id, apartments(building_id)").eq("user_id", user_id).in("status", ["approved", "pending"]);
  const targetBuildings = new Set([...(tm || []).map((m) => m.building_id), ...(tl || []).map((l: any) => l.apartments?.building_id)].filter(Boolean));
  const targetIsAdminSomewhere = (tm || []).some((m) => m.member_role === "admin");

  function mayManageTarget() {
    if (target.id === me.id) return action === "update"; // you can edit yourself, not remove yourself
    if (target.role === "owner") return false;
    if (target.role === "superuser") return me.role === "owner";
    if (privileged) return true;
    if (targetIsAdminSomewhere) return false; // building admins can't manage other admins
    return [...targetBuildings].some((b) => myBuildings.has(b));
  }

  // ---- link: add an existing user to apartments ------------------------------------
  if (action === "link") {
    const ids = [...new Set(body.apartment_ids || [])];
    if (!ids.length) return json({ error: "اختار شقة واحدة على الأقل" }, 400);
    const { data: apts } = await admin.from("apartments").select("id, building_id").in("id", ids);
    if ((apts || []).length !== ids.length) return json({ error: "شقة غير موجودة" }, 400);
    const bids = [...new Set(apts!.map((a) => a.building_id))];
    if (bids.length !== 1 || !canManageBuilding(bids[0])) return json({ error: "مش مسموح لك بالعمارة دي" }, 403);
    if (["owner", "superuser"].includes(target.role)) return json({ error: "الإدارة العليا مش بتتربط بشقق" }, 400);
    if (targetIsAdminSomewhere && !privileged && target.id !== me.id) return json({ error: "مش مسموح" }, 403);
    // building membership (resident) if they have none in this building
    await admin.from("building_members").upsert(
      { building_id: bids[0], user_id, member_role: "resident", status: "approved", approved_by: caller.id, approved_at: new Date().toISOString() },
      { onConflict: "building_id,user_id", ignoreDuplicates: true });
    const now = new Date().toISOString();
    for (const id of ids) {
      const { error } = await admin.from("apartment_residents").insert({
        apartment_id: id, user_id, requested_by: caller.id, status: "approved", reviewed_by: caller.id, reviewed_at: now,
      });
      if (error) {
        if (error.code === "23505") continue; // already linked
        return json({ error: error.message.includes("الحد الأقصى") ? error.message : "تعذر الربط: " + error.message }, 400);
      }
    }
    return json({ ok: true });
  }

  // ---- make_admin: make an existing user admin of a building --------------------------
  if (action === "make_admin") {
    if (!privileged) return json({ error: "تعيين المديرين للمالك بس" }, 403);
    if (!body.building_id) return json({ error: "اختار العمارة" }, 400);
    if (["owner", "superuser"].includes(target.role)) return json({ error: "الإدارة العليا بتدير كل العمارات أصلاً" }, 400);
    const { error } = await admin.from("building_members").upsert(
      { building_id: body.building_id, user_id, member_role: "admin", status: "approved", approved_by: caller.id, approved_at: new Date().toISOString() },
      { onConflict: "building_id,user_id" });
    if (error) return json({ error: error.message }, 400);
    await admin.from("profiles").update({ role: "admin" }).eq("id", user_id).eq("role", "resident");
    return json({ ok: true });
  }

  if (!mayManageTarget()) return json({ error: "مش مسموح لك تعدّل المستخدم ده" }, 403);

  // ---- update ------------------------------------------------------------------------
  if (action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.display_name !== undefined) {
      const n = String(body.display_name).trim();
      if (!n || n.length > 60) return json({ error: "الاسم لازم يكون من 1 لـ 60 حرف" }, 400);
      patch.display_name = n;
    }
    if (body.username !== undefined) {
      const u = String(body.username).trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(u)) return json({ error: "اسم المستخدم من 3 لـ 32 حرف: حروف إنجليزي وأرقام و . _ -" }, 400);
      const { data: taken } = await admin.from("profiles").select("id").ilike("username", u).neq("id", user_id).maybeSingle();
      if (taken) return json({ error: "اسم المستخدم مستخدم بالفعل" }, 409);
      patch.username = u;
    }
    if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;
    const authPatch: Record<string, unknown> = {};
    if (body.email !== undefined && body.email !== (target.email || "")) {
      const e = String(body.email || "").trim();
      if (e && !/^\S+@\S+\.\S+$/.test(e)) return json({ error: "بريد غير صحيح" }, 400);
      if (e) { authPatch.email = e; authPatch.email_confirm = true; patch.email = e; }
    }
    if (body.password) {
      if (String(body.password).length < 8) return json({ error: "كلمة المرور 8 حروف على الأقل" }, 400);
      authPatch.password = body.password;
    }
    if (Object.keys(authPatch).length) {
      const { error } = await admin.auth.admin.updateUserById(user_id, authPatch);
      if (error) return json({ error: error.message.includes("already") ? "البريد ده مستخدم في حساب تاني" : error.message }, 400);
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error } = await admin.from("profiles").update(patch).eq("id", user_id);
      if (error) return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  // ---- disable: remove from every building and block sign-in, keep history -------------
  if (action === "disable") {
    const { error: banErr } = await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
    if (banErr) return json({ error: banErr.message }, 400);
    const now = new Date().toISOString();
    await admin.from("apartment_residents").update({ status: "voided", reviewed_by: caller.id, reviewed_at: now })
      .eq("user_id", user_id).in("status", ["approved", "pending"]);
    await admin.from("building_members").delete().eq("user_id", user_id);
    await admin.from("profiles").update({ disabled_at: now, updated_at: now }).eq("id", user_id);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
