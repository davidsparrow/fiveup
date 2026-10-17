// Finish road 1 — the one-click OAuth path.
//
// Supabase's linkIdentity sends the member to Discord and back. By the time
// this route runs, /auth/confirm has exchanged the code and the Discord
// identity is attached to their auth user. link_discord_from_auth_identity
// reads the snowflake out of auth.identities, so there is nothing here for a
// member to tamper with: they can only link the account they just proved
// they control.
//
// Then the Member role, and back to /account with one sentence.

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getDiscordConfig } from "@/lib/discord/config";
import { grantMemberRole } from "@/lib/discord/member-role";

export const runtime = "nodejs";

function backToAccount(origin, params) {
  const url = new URL("/account", origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/account", origin));
  }

  const { data, error } = await supabase.rpc("link_discord_from_auth_identity");

  if (error) {
    return backToAccount(origin, { discord: "error", message: error.message });
  }

  const config = getDiscordConfig();
  const grant = await grantMemberRole(data?.external_id, config);

  if (grant.granted) {
    const { error: markError } = await supabase.rpc("mark_member_role_granted", {
      p_provider: "discord",
      p_external_id: data?.external_id,
    });
    if (markError) {
      console.error("mark_member_role_granted failed:", markError.message);
    }
  }

  return backToAccount(origin, {
    discord: grant.granted ? "linked" : "linked_no_role",
    message: grant.granted ? null : grant.message,
  });
}
