// Finish road 2, and undo either road.
//
// POST { code } — the member pastes the code the bot gave them. The identity
// row is written under their own session (so RLS and assert_active_caller
// apply exactly as they do everywhere else), then the Member role is granted
// with the bot token, which only the server has.
//
// DELETE — unlink, and take the Member role back with it.
//
// Another composition root: a route may import both sides of the seam.

import { createClient } from "@/lib/supabase/server";
import { describeRedemption } from "@/lib/community/rules/identity";
import { isWellFormedLinkCode, normalizeLinkCode } from "@/lib/community/rules/link-codes";
import { getDiscordConfig } from "@/lib/discord/config";
import { grantMemberRole } from "@/lib/discord/member-role";
import { removeGuildMemberRole } from "@/lib/discord/rest";

export const runtime = "nodejs";

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ ok: false, message: "Sign in first." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Expected a code." }, { status: 400 });
  }

  // Rejected before any network call: a typo should not cost a round trip,
  // and a well-formedness check is not a guessing oracle — it tells an
  // attacker only what the published alphabet already does.
  if (!isWellFormedLinkCode(body?.code)) {
    return Response.json(
      { ok: false, message: "That does not look like a link code. It is 8 characters, like FP3K-9H2M." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("redeem_member_link_code", {
    p_code: normalizeLinkCode(body.code),
  });

  if (error) {
    const described = describeRedemption({ ok: false, errorMessage: error.message });
    return Response.json({ ok: false, outcome: described.outcome, message: described.message }, { status: 400 });
  }

  const linked = describeRedemption({ ok: true, handle: data?.handle, provider: "discord" });
  const config = getDiscordConfig();
  const grant = await grantMemberRole(data?.external_id, config);

  if (grant.granted) {
    const { error: markError } = await supabase.rpc("mark_member_role_granted", {
      p_provider: "discord",
      p_external_id: data?.external_id,
    });
    if (markError) {
      // The role is granted; only our record of it failed. /link retries.
      console.error("mark_member_role_granted failed:", markError.message);
    }
  }

  return Response.json({
    ok: true,
    handle: data?.handle ?? null,
    roleGranted: grant.granted,
    message: `${linked.message} ${grant.granted ? "Member role granted." : grant.message}`.trim(),
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ ok: false, message: "Sign in first." }, { status: 401 });
  }

  // Read the snowflake before the row is unlinked, so the role can be taken
  // back in the same request.
  const { data: identity } = await supabase
    .from("member_identities")
    .select("external_id")
    .eq("user_id", user.id)
    .eq("provider", "discord")
    .eq("status", "linked")
    .maybeSingle();

  const { error } = await supabase.rpc("unlink_member_identity", { p_provider: "discord" });

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 400 });
  }

  if (identity?.external_id) {
    const config = getDiscordConfig();
    await removeGuildMemberRole({
      botToken: config.botToken,
      guildId: config.guildId,
      userId: identity.external_id,
      roleId: config.memberRoleId,
    });
  }

  return Response.json({ ok: true, message: "Discord disconnected." });
}
