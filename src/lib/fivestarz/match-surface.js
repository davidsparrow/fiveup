// Server-only helpers for the Phase A match-surface gate.
//
// The gate is one plan_feature_gates row per plan (feature_key
// 'match_surface', config.surface = 'web' | 'discord'), read through the
// match_surface() RPC. When it is 'web' the archived Browse / preferences UI
// renders; when it is 'discord' those routes send members to the Discord
// invite instead. Restore procedure: docs/archive/web-matching.md.

import { getMatchSurface } from "@/lib/fivestarz/data";

export const MATCH_SURFACE_WEB = "web";
export const MATCH_SURFACE_DISCORD = "discord";

// Where members go when the surface is Discord. Falls back to the dashboard
// (which shows a "matching happens in Discord" notice) so a missing env var
// never produces a dead redirect.
export function getDiscordInviteUrl() {
  return process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || "/dashboard";
}

// Fail-open to 'web': if the RPC is missing or errors (migration not yet
// applied on a preview, network blip), members keep the flow that exists
// today rather than being bounced to Discord by accident.
export async function resolveMatchSurface(supabase) {
  try {
    const surface = await getMatchSurface(supabase);
    return surface === MATCH_SURFACE_DISCORD ? MATCH_SURFACE_DISCORD : MATCH_SURFACE_WEB;
  } catch (err) {
    console.error("match_surface lookup failed; defaulting to web:", err);
    return MATCH_SURFACE_WEB;
  }
}
