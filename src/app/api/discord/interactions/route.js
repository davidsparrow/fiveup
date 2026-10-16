// The Discord interactions endpoint — one URL, every slash command.
//
// This file is the composition root: it is allowed to import both the
// Discord side and the ProofSignals adapter, and it is the only place that
// does. src/lib/discord/* never imports Supabase; src/lib/community/* never
// imports Discord.
//
// Three things here are load-bearing and easy to break:
//
//   • runtime = 'nodejs'. Signature verification uses node:crypto and the
//     service-role client expects Node, not the edge runtime.
//   • request.text(). The signature covers the exact bytes Discord sent, so
//     this handler reads the raw body and parses it itself. Anything that
//     parses first invalidates every signature.
//   • after(). Discord wants a response in three seconds; the work happens
//     after the deferral is sent and PATCHes the placeholder when done.
//
// Rollback (D1's, from the build spec): unset DISCORD_PUBLIC_KEY and this
// endpoint returns 503 for everything while the site keeps working.

import { after } from "next/server";

import { createProofSignalsPort } from "@/lib/community/proofsignals/adapter";
import { getDiscordConfig } from "@/lib/discord/config";
import { editDeferredReply } from "@/lib/discord/respond";
import { handleInteraction } from "@/lib/discord/router";
import {
  DISCORD_SIGNATURE_HEADER,
  DISCORD_TIMESTAMP_HEADER,
  verifyDiscordRequest,
} from "@/lib/discord/verify";
import { getSiteUrl } from "@/lib/fivestarz/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const config = getDiscordConfig();

  if (!config.canVerify) {
    // Not configured, or deliberately switched off. Discord shows the
    // command as failing; the site is unaffected.
    return new Response("Discord interactions are not configured.", { status: 503 });
  }

  const rawBody = await request.text();
  const verified = verifyDiscordRequest({
    rawBody,
    signature: request.headers.get(DISCORD_SIGNATURE_HEADER),
    timestamp: request.headers.get(DISCORD_TIMESTAMP_HEADER),
    publicKey: config.publicKey,
  });

  // Discord requires a 401 for a bad signature — it probes with a
  // deliberately invalid one when you save the endpoint URL and refuses the
  // URL if the probe is answered with anything else.
  if (!verified) {
    return new Response("invalid request signature", { status: 401 });
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response("malformed interaction", { status: 400 });
  }

  const siteUrl = getSiteUrl();

  let result;
  try {
    result = await handleInteraction({
      interaction,
      port: createProofSignalsPort(),
      config,
      siteUrl,
    });
  } catch (err) {
    console.error("Discord interaction failed:", err);
    return Response.json({
      type: 4,
      data: { content: "Something went wrong on our side. Try again in a minute.", flags: 1 << 6 },
    });
  }

  if (result.deferredWork) {
    const appId = config.appId;
    const interactionToken = interaction.token;

    after(async () => {
      let content;
      try {
        content = await result.deferredWork();
      } catch (err) {
        console.error("Discord deferred work failed:", err);
        content = "Something went wrong on our side. Try the command again in a minute.";
      }

      try {
        await editDeferredReply({ appId, interactionToken, content });
      } catch (err) {
        console.error("Discord follow-up failed:", err);
      }
    });
  }

  return Response.json(result.response);
}

// Discord only ever POSTs. A GET is a human checking whether the endpoint is
// up, and a one-line answer is more useful than a 405.
export async function GET() {
  const config = getDiscordConfig();
  return Response.json({
    endpoint: "discord-interactions",
    ready: config.canVerify,
    canGrantRoles: config.canGrantRoles,
  });
}
