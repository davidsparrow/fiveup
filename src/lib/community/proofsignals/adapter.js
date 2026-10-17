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
  });
}
