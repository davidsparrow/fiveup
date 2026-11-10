// The ProofSignals implementation of the community port.
//
// This is the only place in src/lib/community/ that knows Supabase exists,
// and it still knows nothing about Discord: `provider` is a string that
// arrives as an argument. Swapping the backend means writing a sibling to
// this file; swapping the chat platform means writing a sibling adapter in
// front of the port.

import { assertCommunityPort } from "@/lib/community/port";
import { createServiceRoleClient } from "@/lib/community/proofsignals/service-client";

function unwrap(label, { data, error }) {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data ?? {};
}

export function createProofSignalsPort(client = null) {
  const supabase = client ?? createServiceRoleClient();

  return assertCommunityPort({
    async issueLinkCode({ provider, externalId, handle = null }) {
      const data = unwrap(
        "issue_member_link_code",
        await supabase.rpc("issue_member_link_code", {
          p_provider: provider,
          p_external_id: externalId,
          p_external_handle: handle,
        }),
      );

      return {
        status: data.status ?? "failed",
        code: data.code ?? null,
        expiresAt: data.expires_at ?? null,
        userId: data.user_id ?? null,
        roleGrantedAt: data.role_granted_at ?? null,
      };
    },

    async resolveMember({ provider, externalId }) {
      const data = unwrap(
        "member_for_external_identity",
        await supabase.rpc("member_for_external_identity", {
          p_provider: provider,
          p_external_id: externalId,
        }),
      );

      if (data.status !== "linked") {
        return { status: "unlinked" };
      }

      return {
        status: "linked",
        userId: data.user_id,
        handle: data.handle ?? null,
        displayName: data.display_name ?? null,
        publicUsername: data.public_username ?? null,
        planCode: data.plan_code ?? null,
        accountStatus: data.account_status ?? null,
        // D3. /group create inherits this, so a dropped key here is a whole
        // server's worth of groups with no track and a recommender with
        // nothing to filter on.
        track: data.track ?? null,
        isDemo: Boolean(data.is_demo),
        roleGrantedAt: data.role_granted_at ?? null,
      };
    },

    async markRoleGranted({ provider, externalId }) {
      const { error } = await supabase.rpc("mark_member_role_granted", {
        p_provider: provider,
        p_external_id: externalId,
      });

      if (error) {
        throw new Error(`mark_member_role_granted: ${error.message}`);
      }
    },

    // ── Groups (D2) ─────────────────────────────────────────────────────────
    //
    // Every call passes p_acting_user_id. The RPCs resolve a member through
    // resolve_acting_member, which honours that argument ONLY for the service
    // role — so this client may act for a member while a member's own browser
    // cannot act for anyone else. Without it these functions would resolve
    // auth.uid(), which is null here, and every one of them would refuse.

    async createGroup({ userId, name, assetId, kind = "feedback", track = null, visibility = "private", maxMembers = null }) {
      const data = unwrap(
        "create_group",
        await supabase.rpc("create_group", {
          p_name: name,
          p_asset_id: assetId,
          p_kind: kind,
          p_track: track,
          p_visibility: visibility,
          p_max_members: maxMembers,
          p_acting_user_id: userId,
        }),
      );

      return {
        status: data.status ?? "failed",
        groupId: data.group_id ?? null,
        kind: data.kind ?? null,
        name: data.name ?? null,
        track: data.track ?? null,
        visibility: data.visibility ?? null,
        maxMembers: data.max_members ?? null,
      };
    },

    async inviteMember({ userId, groupId, inviteeUserId, joinedVia = "invite" }) {
      const data = unwrap(
        "invite_to_group",
        await supabase.rpc("invite_to_group", {
          p_group_id: groupId,
          p_user_id: inviteeUserId,
          p_joined_via: joinedVia,
          p_acting_user_id: userId,
        }),
      );

      return { status: data.status ?? "failed", groupId, userId: inviteeUserId, reinvited: Boolean(data.reinvited) };
    },

    async joinGroup({ userId, groupId, assetId = null }) {
      const data = unwrap(
        "join_group",
        await supabase.rpc("join_group", {
          p_group_id: groupId,
          p_asset_id: assetId,
          p_acting_user_id: userId,
        }),
      );

      return { status: data.status ?? "failed", groupId };
    },

    // The owner's shortlist. Nothing here writes a row and nothing adds
    // anyone: an invite is still inviteMember, and the invitee still accepts.
    async recommendMembers({ userId, groupId, limit = 10 }) {
      const { data, error } = await supabase.rpc("recommend_group_members", {
        p_group_id: groupId,
        p_limit: limit,
        p_acting_user_id: userId,
      });

      if (error) {
        throw new Error(`recommend_group_members: ${error.message}`);
      }

      return (data ?? []).map((row) => ({
        userId: row.candidate_user_id,
        displayName: row.candidate_display_name ?? null,
        publicUsername: row.candidate_public_username ?? null,
        planCode: row.candidate_plan_code ?? null,
        track: row.candidate_track ?? null,
        assetId: row.candidate_asset_id ?? null,
        assetName: row.candidate_asset_name ?? null,
        assetType: row.candidate_asset_type ?? null,
        shortestPathDegree: row.shortest_path_degree ?? null,
        priorMatchCount: row.prior_match_count ?? 0,
      }));
    },

    async listGroups({ userId }) {
      const { data, error } = await supabase.rpc("my_groups", { p_acting_user_id: userId });

      if (error) {
        throw new Error(`my_groups: ${error.message}`);
      }

      return (data ?? []).map((row) => ({
        groupId: row.group_id,
        kind: row.kind,
        name: row.name,
        track: row.track ?? null,
        visibility: row.visibility,
        status: row.status,
        maxMembers: row.max_members,
        discordThreadId: row.discord_thread_id ?? null,
        myRole: row.my_role,
        myStatus: row.my_status,
        activeMemberCount: row.active_member_count ?? 0,
        pendingRequestCount: row.pending_request_count ?? 0,
      }));
    },

    async groupRoster({ userId, groupId }) {
      const { data, error } = await supabase.rpc("group_roster", {
        p_group_id: groupId,
        p_acting_user_id: userId,
      });

      if (error) {
        throw new Error(`group_roster: ${error.message}`);
      }

      return (data ?? []).map((row) => ({
        userId: row.user_id,
        displayName: row.display_name ?? null,
        publicUsername: row.public_username ?? null,
        track: row.track ?? null,
        role: row.member_role,
        status: row.member_status,
        joinedVia: row.joined_via,
        assetId: row.asset_id ?? null,
        assetName: row.asset_name ?? null,
      }));
    },

    async closeGroup({ userId, groupId }) {
      const data = unwrap(
        "close_group",
        await supabase.rpc("close_group", { p_group_id: groupId, p_acting_user_id: userId }),
      );

      return { status: data.status ?? "failed", groupId };
    },

    // The one write no member makes: recording the private thread Discord
    // created for a group. Service role or admin only, enforced in the RPC.
    async recordGroupRoom({ groupId, threadId = null, channelId = null }) {
      const data = unwrap(
        "set_group_discord_ids",
        await supabase.rpc("set_group_discord_ids", {
          p_group_id: groupId,
          p_thread_id: threadId,
          p_channel_id: channelId,
        }),
      );

      return { status: data.status ?? "failed", groupId };
    },

    // ── D3 · what a chat surface needs that a web page gets for free ───────

    // Discord has no dropdown. It asks for the list and decides in the
    // handler; the criteria here are my_pairable_assets', which are
    // assert_pairable_asset's, so the bot never offers an asset the write
    // RPC will then refuse.
    async listPairableAssets({ userId }) {
      const { data, error } = await supabase.rpc("my_pairable_assets", {
        p_acting_user_id: userId,
      });

      if (error) {
        throw new Error(`my_pairable_assets: ${error.message}`);
      }

      return (data ?? []).map((row) => ({
        assetId: row.asset_id,
        name: row.name,
        assetType: row.asset_type ?? null,
        createdAt: row.created_at ?? null,
      }));
    },

    // Everything /me says, in one round trip. The cap helpers behind this are
    // revoked from authenticated, so there is no way to assemble it caller-side.
    async memberOverview({ userId }) {
      const data = unwrap(
        "member_overview",
        await supabase.rpc("member_overview", { p_acting_user_id: userId }),
      );

      const caps = data.caps ?? {};
      const usage = data.usage ?? {};

      return {
        userId: data.user_id ?? userId,
        displayName: data.display_name ?? null,
        publicUsername: data.public_username ?? null,
        planCode: data.plan_code ?? null,
        accountStatus: data.account_status ?? null,
        track: data.track ?? null,
        isDemo: Boolean(data.is_demo),
        matchSurface: data.match_surface ?? "web",
        caps: {
          // ?? null, not ?? 0: a cap of 0 is "none allowed" and a cap of null
          // is "no gate row". The formatter renders them differently on purpose.
          maxConcurrentGroups: caps.max_concurrent_groups ?? null,
          feedbackGroupsPerMonth: caps.feedback_groups_per_month ?? null,
          maxConcurrentMatchups: caps.max_concurrent_matchups ?? null,
        },
        usage: {
          openGroups: usage.open_groups ?? 0,
          groupsJoinedThisMonth: usage.groups_joined_this_month ?? 0,
          concurrentMatchups: usage.concurrent_matchups ?? 0,
        },
        pairableAssetCount: data.pairable_asset_count ?? 0,
      };
    },

    // canJoin and blockedReason are the backend's to compute: the caps that
    // decide them are not readable by a member, which is why this reader
    // exists rather than the handler filtering a plain list.
    async discoverGroups({ userId, limit = 30 }) {
      const { data, error } = await supabase.rpc("discoverable_groups", {
        p_limit: limit,
        p_acting_user_id: userId,
      });

      if (error) {
        throw new Error(`discoverable_groups: ${error.message}`);
      }

      return (data ?? []).map((row) => ({
        groupId: row.group_id,
        kind: row.kind,
        name: row.name,
        track: row.track ?? null,
        visibility: row.visibility,
        status: row.status,
        maxMembers: row.max_members,
        activeMemberCount: row.active_member_count ?? 0,
        ownerDisplayName: row.owner_display_name ?? null,
        joinsByRequest: Boolean(row.joins_by_request),
        canJoin: Boolean(row.can_join),
        blockedReason: row.blocked_reason ?? null,
      }));
    },

    async respondToInvite({ userId, groupId, accept, assetId = null }) {
      const data = unwrap(
        "respond_to_group_invite",
        await supabase.rpc("respond_to_group_invite", {
          p_group_id: groupId,
          p_accept: accept,
          p_asset_id: assetId,
          p_acting_user_id: userId,
        }),
      );

      return { status: data.status ?? "failed", groupId, role: data.role ?? null };
    },

    // leave_group reports what happened to the room, not just to the seat:
    // the longest-standing member may have inherited it, or it may have
    // closed because nobody was left. Both change what the member is told.
    async leaveGroup({ userId, groupId }) {
      const data = unwrap(
        "leave_group",
        await supabase.rpc("leave_group", {
          p_group_id: groupId,
          p_acting_user_id: userId,
        }),
      );

      return {
        status: data.status ?? "failed",
        groupId,
        newOwnerUserId: data.new_owner_user_id ?? null,
        groupClosed: Boolean(data.group_closed),
      };
    },
  });
}
