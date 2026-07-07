"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getModerationAccess, resolveFlag } from "@/lib/fivestarz/data";

const VALID_ACTIONS = new Set([
  "dismiss",
  "remove_content",
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

  revalidatePath("/admin");
  redirect(`/admin?status=${status}&done=${action}`);
}
