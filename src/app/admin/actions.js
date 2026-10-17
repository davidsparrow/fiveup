"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getModerationAccess, resolveFlag, setMemberPlan } from "@/lib/fivestarz/data";
import { sendModerationOutcomeEmail } from "@/lib/fivestarz/moderation-email";

// flourish is retired; set_member_plan refuses it too.
const VALID_PLANS = new Set(["sprout", "bloom"]);

const VALID_ACTIONS = new Set([
  "dismiss",
  "remove_content",
  "restore_content",
  "warn_user",
  "suspend_user",
  "reinstate_user",
]);

// Handle a moderation action button. The resolve_flag RPC is itself
// moderator-guarded, but we re-check here so a non-moderator never gets past
// the server action either (defense in depth).
export async function resolveFlagAction(formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { isModerator } = await getModerationAccess(supabase);
  if (!isModerator) redirect("/dashboard");

  const flagId = String(formData.get("flagId") ?? "");
  const action = String(formData.get("action") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "pending");

  if (!flagId || !VALID_ACTIONS.has(action)) {
    redirect(`/admin?status=${status}&error=${encodeURIComponent("invalid moderation action")}`);
  }

  try {
    await resolveFlag(supabase, { flagId, action, notes: notes || null });
  } catch (err) {
    redirect(`/admin?status=${status}&error=${encodeURIComponent(err?.message ?? "action failed")}`);
  }

  // Best-effort member notification — never blocks the moderation action
  // (the helper catches its own failures and skips when unconfigured).
  await sendModerationOutcomeEmail({ flagId, action });

  revalidatePath("/admin");
  redirect(`/admin?status=${status}&done=${action}`);
}

// Set a member's plan by hand. This is the launch mechanism for Skool
// membership — Skool is the billing system and there is no Stripe — and it
// stays the permanent fallback for every case an automated sync misses.
//
// set_member_plan is itself admin-guarded and refuses `flourish`; the checks
// here are defence in depth, and the plan_grants row it writes is the audit
// trail for a change that decides quotas, publishing and the Discord Pro role.
export async function setMemberPlanAction(formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { isAdmin } = await getModerationAccess(supabase);
  if (!isAdmin) redirect("/dashboard");

  const userId = String(formData.get("userId") ?? "");
  const planCode = String(formData.get("planCode") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const externalRef = String(formData.get("externalRef") ?? "").trim();
  const query = String(formData.get("q") ?? "").trim();

  const back = (params) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    Object.entries(params).forEach(([k, v]) => sp.set(k, v));
    return `/admin?${sp.toString()}`;
  };

  if (!userId || !VALID_PLANS.has(planCode)) {
    redirect(back({ error: "pick sprout or bloom" }));
  }

  let result;
  try {
    result = await setMemberPlan(supabase, {
      userId,
      planCode,
      // 'skool' when a Skool reference was supplied, since that is what the
      // entitlement actually rests on; 'admin' when it is a bare decision.
      source: externalRef ? "skool" : "admin",
      externalRef: externalRef || null,
      note: note || null,
    });
  } catch (err) {
    redirect(back({ error: err?.message ?? "could not set plan" }));
  }

  // Outside the try: redirect() signals by throwing, and catching it here
  // would report the framework's own control flow as a failure.
  revalidatePath("/admin");
  redirect(back({ done: result?.status === "unchanged" ? "plan unchanged" : `plan set to ${planCode}` }));
}
