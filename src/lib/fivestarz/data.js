// Thin data-access layer over the real Supabase schema (supabase/migrations/).
// Each function takes a Supabase client (browser or server) plus plain args,
// and either runs a direct table query (RLS-protected) or calls an RPC.

import { ASSET_TYPE_LABEL_TO_DB, FEEDBACK_FORMAT_LABEL_TO_DB } from "@/lib/fivestarz/enums";

export async function getMyProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function createAsset(supabase, form) {
  const { data: assetId, error } = await supabase.rpc("create_asset", {
    p_name: form.name,
    p_public_url: form.url,
    p_asset_type: ASSET_TYPE_LABEL_TO_DB[form.type],
    p_description: form.desc || null,
    p_is_client_asset: form.forClient,
    p_client_name: form.forClient ? form.clientName || null : null,
    p_require_star_rating: form.reqStars,
    p_require_star_plus_one_other: form.reqTwo,
    p_channels: form.channels,
    p_feedback_formats: form.fbTypes.map((label) => FEEDBACK_FORMAT_LABEL_TO_DB[label]),
  });

  if (error) throw error;
  return { id: assetId };
}

// Uploads one screenshot File to the asset-screenshots Storage bucket at
// `<assetId>/<unique-name>`, then records that path in asset_screenshots.
// Storage RLS restricts writes to the object owner; the table's write policy
// restricts rows to the asset owner — both resolve to the current user.
export async function uploadAssetScreenshot(supabase, assetId, file, sortOrder = 0) {
  const safeName = (file.name || "screenshot").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${assetId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("asset-screenshots")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from("asset_screenshots")
    .insert({ asset_id: assetId, storage_path: path, sort_order: sortOrder });

  if (insertError) throw insertError;

  return path;
}

export async function listMyAssets(supabase, ownerId) {
  const { data, error } = await supabase
    .from("assets")
    .select("*, asset_channels(channel_name), asset_feedback_formats(format)")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ── Match surface gate (Phase A) ───────────────────────────────────────────

// 'web' | 'discord' for the caller's plan (anon reads the sprout row). The
// RPC itself falls back to 'web' when the gate row is missing.
export async function getMatchSurface(supabase) {
  const { data, error } = await supabase.rpc("match_surface");
  if (error) throw error;
  return data;
}

// ARCHIVED: web matching surface — see docs/archive/web-matching.md. Do not delete.
export async function getBrowseQuota(supabase, planCode, userId) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const usageMonth = monthStart.toISOString().slice(0, 10);

  const [{ data: gate, error: gateError }, { data: usage, error: usageError }] = await Promise.all([
    supabase
      .from("plan_feature_gates")
      .select("limit_int")
      .eq("plan_code", planCode)
      .eq("feature_key", "browse_matches_per_month")
      .maybeSingle(),
    supabase
      .from("user_monthly_usage")
      .select("browse_matches_initiated")
      .eq("user_id", userId)
      .eq("usage_month", usageMonth)
      .maybeSingle(),
  ]);

  if (gateError) throw gateError;
  if (usageError) throw usageError;

  return {
    limit: gate?.limit_int ?? 0,
    used: usage?.browse_matches_initiated ?? 0,
  };
}

// ARCHIVED: web matching surface — see docs/archive/web-matching.md. Do not delete.
export async function getEligibleCandidates(supabase, myAssetId, { limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc("eligible_match_candidates", {
    p_my_asset_id: myAssetId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;
  return data;
}

export async function getChannelsAndFormatsForAssets(supabase, assetIds) {
  if (assetIds.length === 0) return { channelsByAsset: {}, formatsByAsset: {} };

  const [{ data: channels, error: channelsError }, { data: formats, error: formatsError }] = await Promise.all([
    supabase.from("asset_channels").select("asset_id, channel_name").in("asset_id", assetIds),
    supabase.from("asset_feedback_formats").select("asset_id, format").in("asset_id", assetIds),
  ]);

  if (channelsError) throw channelsError;
  if (formatsError) throw formatsError;

  const channelsByAsset = {};
  channels.forEach(({ asset_id, channel_name }) => {
    (channelsByAsset[asset_id] ||= []).push(channel_name);
  });

  const formatsByAsset = {};
  formats.forEach(({ asset_id, format }) => {
    (formatsByAsset[asset_id] ||= []).push(format);
  });

  return { channelsByAsset, formatsByAsset };
}

// ARCHIVED: web matching surface — see docs/archive/web-matching.md. Do not delete.
export async function requestMatch(
  supabase,
  { otherUserId, myAssetId, theirAssetId, previousMatchId = null, myBlockedChannels = [], theirBlockedChannels = [] },
) {
  const params = {
    p_other_user_id: otherUserId,
    p_my_asset_id: myAssetId,
    p_their_asset_id: theirAssetId,
    p_source: "browse",
  };

  // create_match requires previous_match_id whenever any prior match exists
  // between the two users; only then does it read the blocked-channel arrays.
  if (previousMatchId) {
    params.p_previous_match_id = previousMatchId;
    params.p_my_blocked_channels = myBlockedChannels;
    params.p_their_blocked_channels = theirBlockedChannels;
  }

  const { data, error } = await supabase.rpc("create_match", params);

  if (error) throw error;
  return data;
}

// All matches between the two users (any status), newest first. The newest id
// is passed to create_match as p_previous_match_id; the full list feeds the
// union of already-used channels below.
export async function getPreviousMatches(supabase, userId, otherUserId) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, created_at")
    .or(
      `and(member_a_user_id.eq.${userId},member_b_user_id.eq.${otherUserId}),and(member_a_user_id.eq.${otherUserId},member_b_user_id.eq.${userId})`,
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return {
    previousMatchId: data[0]?.id ?? null,
    priorMatchIds: data.map((m) => m.id),
  };
}

// Union of channels an external review was reported on across the given prior
// matches, split by who was reviewed: `mine` are channels where the caller was
// the subject (blocked for the caller in the new match), `theirs` the other
// member's. Reports are member-volunteered; the platform never asks for them.
export async function getUsedChannelsForMatches(supabase, matchIds, myUserId) {
  if (matchIds.length === 0) return { mine: [], theirs: [] };

  const { data: reports, error } = await supabase
    .from("external_review_reports")
    .select("subject_user_id, channel_name, status")
    .in("match_id", matchIds);

  if (error) throw error;

  const mine = new Set();
  const theirs = new Set();
  reports
    .filter((r) => r.status !== "retracted")
    .forEach((r) => {
      if (r.subject_user_id === myUserId) mine.add(r.channel_name);
      else theirs.add(r.channel_name);
    });

  return { mine: [...mine], theirs: [...theirs] };
}

export async function listMyMatches(supabase, userId) {
  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      "*, member_a_asset:assets!member_a_asset_id(id, name, asset_type, asset_channels(channel_name)), member_b_asset:assets!member_b_asset_id(id, name, asset_type, asset_channels(channel_name))",
    )
    .or(`member_a_user_id.eq.${userId},member_b_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (matches.length === 0) return [];

  const otherUserIds = [...new Set(matches.map(m => (m.member_a_user_id === userId ? m.member_b_user_id : m.member_a_user_id)))];
  const matchIds = matches.map(m => m.id);

  const [{ data: profiles, error: profilesError }, { data: feedback, error: feedbackError }] = await Promise.all([
    supabase.from("user_profiles").select("user_id, display_name").in("user_id", otherUserIds),
    supabase.from("feedback_submissions").select("id, match_id, reviewer_user_id, stars").in("match_id", matchIds),
  ]);

  if (profilesError) throw profilesError;
  if (feedbackError) throw feedbackError;

  const theirFeedbackIds = feedback.filter(f => otherUserIds.includes(f.reviewer_user_id)).map(f => f.id);

  const [{ data: ratings, error: ratingsError }, { data: externalReports, error: externalReportsError }] = await Promise.all([
    theirFeedbackIds.length
      ? supabase.from("member_feedback_ratings").select("feedback_submission_id, stars").eq("rater_user_id", userId).in("feedback_submission_id", theirFeedbackIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("external_review_reports").select("id, match_id, subject_user_id, author_user_id, reported_by_user_id, channel_name, posted_url, status").in("match_id", matchIds),
  ]);

  if (ratingsError) throw ratingsError;
  if (externalReportsError) throw externalReportsError;

  const profileById = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  const feedbackByMatch = {};
  feedback.forEach(f => {
    (feedbackByMatch[f.match_id] ||= []).push(f);
  });
  const ratingByFeedbackId = Object.fromEntries(ratings.map(r => [r.feedback_submission_id, r.stars]));
  const externalReportsByMatch = {};
  externalReports.forEach(r => {
    (externalReportsByMatch[r.match_id] ||= []).push(r);
  });

  return matches.map(m => {
    const isA = m.member_a_user_id === userId;
    const otherUserId = isA ? m.member_b_user_id : m.member_a_user_id;
    const myAsset = isA ? m.member_a_asset : m.member_b_asset;
    const theirAsset = isA ? m.member_b_asset : m.member_a_asset;
    const feedbackRows = feedbackByMatch[m.id] || [];
    const myFeedback = feedbackRows.find(f => f.reviewer_user_id === userId) || null;
    const theirFeedback = feedbackRows.find(f => f.reviewer_user_id === otherUserId) || null;

    return {
      id: m.id,
      status: m.status,
      otherUserId,
      otherDisplayName: profileById[otherUserId]?.display_name || "Member",
      myAsset,
      theirAsset,
      myFeedback,
      theirFeedback,
      theirFeedbackMyRating: theirFeedback ? ratingByFeedbackId[theirFeedback.id] ?? null : null,
      externalReviewReports: (externalReportsByMatch[m.id] || []).filter(r => r.status !== "retracted"),
    };
  });
}

export async function submitFeedback(supabase, { matchId, stars, writtenFeedback, structuredFeedback }) {
  const { data, error } = await supabase.rpc("submit_feedback", {
    p_match_id: matchId,
    p_stars: stars || null,
    p_written_feedback: writtenFeedback || null,
    p_structured_feedback: structuredFeedback || {},
    p_media_url: null,
  });

  if (error) throw error;
  return data;
}

export async function rateFeedback(supabase, { feedbackSubmissionId, stars }) {
  const { data, error } = await supabase.rpc("rate_member_feedback", {
    p_feedback_submission_id: feedbackSubmissionId,
    p_stars: stars,
  });

  if (error) throw error;
  return data;
}

// A member records that a review happened outside ProofSignals — in either
// direction. Nothing in the product asks them to post one; this only records
// what already happened, and it is the seed data for per-channel separation.
export async function reportExternalReview(supabase, { matchId, channelName, iAmTheAuthor, postedUrl }) {
  const { data, error } = await supabase.rpc("report_external_review", {
    p_match_id: matchId,
    p_channel_name: channelName,
    p_i_am_the_author: iAmTheAuthor,
    p_posted_url: postedUrl || null,
  });

  if (error) throw error;
  return data;
}

export async function retractExternalReviewReport(supabase, reportId) {
  const { error } = await supabase.rpc("retract_external_review_report", {
    p_report_id: reportId,
  });

  if (error) throw error;
}

// Published caps for the /pricing lander. Readable by anonymous visitors —
// public_plan_caps() is a whitelist over plan_feature_gates, so internal
// switches are not exposed. Returns [] rather than throwing: a pricing page
// that cannot read the gates should still render its copy.
export async function getPublicPlanCaps(supabase) {
  const { data, error } = await supabase.rpc("public_plan_caps");

  if (error) {
    console.error("public_plan_caps failed; rendering the cards without caps:", error);
    return [];
  }

  return data ?? [];
}

// ── Plans and entitlements ───────────────────────────────────────────────────

// Plan plus where it came from. A member may read their own; admins may read
// anyone's. Returns source 'signup' when no grant row exists, which is what
// every account on the free default looks like.
export async function getMemberPlanState(supabase, userId = null) {
  const { data, error } = await supabase.rpc("member_plan_state", {
    p_user_id: userId,
  });

  if (error) throw error;
  return data;
}

// The one writer. Admin or service role only — set_member_plan re-checks.
// `source` records what caused the change ('skool' | 'stripe' | 'admin'), so
// adding a second billing system later is a new caller rather than a
// refactor of everything that reads a plan.
export async function setMemberPlan(supabase, { userId, planCode, source = "admin", externalRef = null, note = null }) {
  const { data, error } = await supabase.rpc("set_member_plan", {
    p_user_id: userId,
    p_plan_code: planCode,
    p_source: source,
    p_external_ref: externalRef,
    p_note: note,
  });

  if (error) throw error;
  return data;
}

export async function searchMembersAsAdmin(supabase, query, limit = 20) {
  const { data, error } = await supabase.rpc("admin_search_members", {
    p_query: query,
    p_limit: limit,
  });

  if (error) throw error;
  return data ?? [];
}

export async function listPlanGrants(supabase, userId, limit = 10) {
  const { data, error } = await supabase
    .from("plan_grants")
    .select("id, plan_code, previous_plan_code, source, external_ref, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

// ── Linked accounts (Discord, later Skool) ───────────────────────────────────

// RLS limits this to the caller's own rows; there is no path to anyone
// else's. Writes go through the RPCs in
// 20261015130000_phase20_member_identities.sql, never through the table.
export async function listMyMemberIdentities(supabase, userId) {
  const { data, error } = await supabase
    .from("member_identities")
    .select("id, provider, external_id, handle, status, linked_via, linked_at, role_granted_at")
    .eq("user_id", userId)
    .order("linked_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getMyLinkedIdentity(supabase, userId, provider) {
  const rows = await listMyMemberIdentities(supabase, userId);
  return rows.find((row) => row.provider === provider && row.status === "linked") ?? null;
}

// ── Proof Market (marketplace) ────────────────────────────────────────────────

export async function getProofLabCategories(supabase) {
  const { data, error } = await supabase
    .from("proof_lab_categories")
    .select("slug, label")
    .order("sort_order");

  if (error) throw error;
  return data;
}

export async function getCharities(supabase) {
  const { data, error } = await supabase
    .from("charities")
    .select("id, name, url, logo_emoji")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return data;
}

// Active listings visible to all members. RLS enforces active-or-owner AND
// the demo/real wall server-side (demo sellers are visible only to demo
// viewers, and vice versa) — no viewer lookup needed here. The anonymous
// teaser still counts demo listings via its own SECURITY DEFINER RPCs.
export async function listProofLabListings(supabase, { categorySlug } = {}) {
  let query = supabase
    .from("proof_lab_listings")
    .select(
      "*, seller:user_profiles!seller_user_id(display_name, proof_lab_rating_avg, proof_lab_rating_count), category:proof_lab_categories!category_slug(label), asset:assets!asset_id(name), charity:charities!charity_id(name, logo_emoji)",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (categorySlug) query = query.eq("category_slug", categorySlug);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listMyProofLabListings(supabase, sellerId) {
  const { data, error } = await supabase
    .from("proof_lab_listings")
    .select("*, category:proof_lab_categories!category_slug(label), charity:charities!charity_id(name, logo_emoji)")
    .eq("seller_user_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createProofLabListing(supabase, form) {
  const { data, error } = await supabase.rpc("create_proof_lab_listing", {
    p_title: form.title,
    p_description: form.description,
    p_category_slug: form.categorySlug,
    p_retail_price_cents: form.retailPriceCents ?? null,
    p_member_price_cents: form.memberPriceCents ?? null,
    p_price_unit: form.priceUnit || null,
    p_badge: form.badge || null,
    p_asset_id: form.assetId || null,
    p_donation_percent: form.donationPercent ?? null,
    p_charity_id: form.charityId || null,
  });

  if (error) throw error;
  return data;
}

export async function updateProofLabListing(supabase, listingId, form) {
  const { error } = await supabase.rpc("update_proof_lab_listing", {
    p_listing_id: listingId,
    p_title: form.title,
    p_description: form.description,
    p_category_slug: form.categorySlug,
    p_retail_price_cents: form.retailPriceCents ?? null,
    p_member_price_cents: form.memberPriceCents ?? null,
    p_price_unit: form.priceUnit || null,
    p_badge: form.badge || null,
    p_asset_id: form.assetId || null,
    p_donation_percent: form.donationPercent ?? null,
    p_charity_id: form.charityId || null,
  });

  if (error) throw error;
}

export async function setProofLabListingStatus(supabase, listingId, status) {
  const { error } = await supabase.rpc("set_proof_lab_listing_status", {
    p_listing_id: listingId,
    p_status: status,
  });

  if (error) throw error;
}

export async function requestProofLabDeal(supabase, { listingId, email, note, timeframe }) {
  const { data, error } = await supabase.rpc("request_proof_lab_deal", {
    p_listing_id: listingId,
    p_requester_email: email,
    p_note: note || null,
    p_timeframe: timeframe || "soon",
  });

  if (error) throw error;
  return data;
}

// Deal requests received on the seller's own listings, newest first.
export async function listIncomingDealRequests(supabase, sellerId) {
  const { data, error } = await supabase
    .from("proof_lab_deal_requests")
    .select(
      "*, listing:proof_lab_listings!listing_id(title), requester:user_profiles!requester_user_id(display_name)",
    )
    .eq("seller_user_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Deal requests the current member has sent to other sellers, newest first.
// Embeds the buyer's own review (if any) so the UI can show "reviewed" vs
// offer a "Leave Review" action on completed deals.
export async function listOutgoingDealRequests(supabase, requesterId) {
  const { data, error } = await supabase
    .from("proof_lab_deal_requests")
    .select(
      "*, listing:proof_lab_listings!listing_id(title), seller:user_profiles!seller_user_id(display_name), review:proof_lab_reviews!deal_request_id(id, stars)",
    )
    .eq("requester_user_id", requesterId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ── Deal lifecycle transitions (all RPC-only; see 6b.1 migration) ──────────
export async function acceptProofLabDeal(supabase, dealId) {
  const { error } = await supabase.rpc("accept_proof_lab_deal", { p_deal_id: dealId });
  if (error) throw error;
}

export async function declineProofLabDeal(supabase, dealId) {
  const { error } = await supabase.rpc("decline_proof_lab_deal", { p_deal_id: dealId });
  if (error) throw error;
}

export async function cancelProofLabDeal(supabase, dealId) {
  const { error } = await supabase.rpc("cancel_proof_lab_deal", { p_deal_id: dealId });
  if (error) throw error;
}

export async function markProofLabDealFulfilled(supabase, dealId) {
  const { error } = await supabase.rpc("mark_proof_lab_deal_fulfilled", { p_deal_id: dealId });
  if (error) throw error;
}

// Either participant confirms a fulfilled deal completed; both → 'completed'.
export async function confirmProofLabDeal(supabase, dealId) {
  const { error } = await supabase.rpc("confirm_proof_lab_deal", { p_deal_id: dealId });
  if (error) throw error;
}

// Per-seller pledged-donation totals over completed deals (optionally since a date).
export async function getFundraiserLeaderboard(supabase, since = null) {
  const { data, error } = await supabase.rpc("proof_lab_fundraiser_leaderboard", {
    p_since: since,
  });
  if (error) throw error;
  return data;
}

// Buyer leaves a review on a completed deal (buyer-only, one per deal, RPC-gated).
export async function createProofLabReview(supabase, { dealId, stars, written }) {
  const { data, error } = await supabase.rpc("create_proof_lab_review", {
    p_deal_id: dealId,
    p_stars: stars,
    p_written: written || null,
  });
  if (error) throw error;
  return data;
}

// Reviews a seller has received, newest first (for their dashboard).
export async function getProofLabReviewsForSeller(supabase, sellerId) {
  const { data, error } = await supabase
    .from("proof_lab_reviews")
    .select("*, reviewer:user_profiles!reviewer_user_id(display_name), listing:proof_lab_listings!listing_id(title)")
    .eq("reviewee_user_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ── Trust & Safety / moderation (Phase 7) ──────────────────────────────────

// Whether the caller may access the moderation console (admin OR moderator)
// and, separately, whether they hold the higher admin role (some ops actions
// stay admin-only).
export async function getModerationAccess(supabase) {
  const [{ data: isModerator, error: mErr }, { data: isAdmin, error: aErr }] = await Promise.all([
    supabase.rpc("is_moderator"),
    supabase.rpc("is_admin"),
  ]);
  if (mErr) throw mErr;
  if (aErr) throw aErr;
  return { isModerator: !!isModerator, isAdmin: !!isAdmin };
}

// Moderation queue — flags joined to a rendered snippet of the offending text.
export async function listModerationQueue(supabase, status = "pending") {
  const { data, error } = await supabase.rpc("list_moderation_queue", {
    p_status: status || null,
  });
  if (error) throw error;
  return data ?? [];
}

// Act on a flag: dismiss | remove_content | warn_user | suspend_user | reinstate_user.
export async function resolveFlag(supabase, { flagId, action, notes }) {
  const { error } = await supabase.rpc("resolve_flag", {
    p_flag_id: flagId,
    p_action: action,
    p_notes: notes || null,
  });
  if (error) throw error;
}

// Admin-only ops flag: fulfilled Proof Market deals stuck awaiting one-sided
// confirmation (homeless since Phase 6b.2 — surfaced in the console).
export async function listDealsAwaitingConfirmation(supabase, staleDays = 14) {
  const { data, error } = await supabase.rpc("proof_lab_deals_awaiting_confirmation", {
    p_stale_days: staleDays,
  });
  if (error) throw error;
  return data ?? [];
}

// ── Track (the entry cohort) ─────────────────────────────────────────────────

// user_profiles takes no direct writes from authenticated (revoked in
// 20260715120000), so the RPC is the only road — the same arrangement
// plan_code has. Pass no userId to set your own; an admin may pass one.
export async function setMemberTrack(supabase, { track, userId = null } = {}) {
  const { data, error } = await supabase.rpc("set_member_track", {
    p_track: track,
    p_user_id: userId,
  });

  if (error) throw error;
  return data;
}

// ── Groups (feedback groups; challenge cohorts from D5) ──────────────────────
//
// Every write here is an RPC. groups and group_members have insert, update and
// delete revoked from `authenticated`, so there is no table-write path to fall
// back on and no way for a client to skip a cap.

export async function listMyGroups(supabase) {
  const { data, error } = await supabase.rpc("my_groups", { p_acting_user_id: null });

  if (error) throw error;
  return data ?? [];
}

// "Find a group": listed and open rooms the caller is not already in.
// `can_join` is advisory — join_group re-decides it server-side, so a page
// left open does not become a way past a cap.
export async function listDiscoverableGroups(supabase, { limit = 30 } = {}) {
  const { data, error } = await supabase.rpc("discoverable_groups", {
    p_limit: limit,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data ?? [];
}

export async function getGroupRoster(supabase, groupId) {
  const { data, error } = await supabase.rpc("group_roster", {
    p_group_id: groupId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data ?? [];
}

export async function createGroup(
  supabase,
  { name, assetId, kind = "feedback", track = null, visibility = "private", maxMembers = null } = {},
) {
  const { data, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_asset_id: assetId,
    p_kind: kind,
    p_track: track,
    p_visibility: visibility,
    p_max_members: maxMembers,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

// joinedVia records whether the invite came out of the recommendations or the
// owner's own head — the column that answers "do recommended members
// outperform self-invited ones" a year from now.
export async function inviteToGroup(supabase, { groupId, userId, joinedVia = "invite" }) {
  const { data, error } = await supabase.rpc("invite_to_group", {
    p_group_id: groupId,
    p_user_id: userId,
    p_joined_via: joinedVia,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

export async function respondToGroupInvite(supabase, { groupId, accept, assetId = null }) {
  const { data, error } = await supabase.rpc("respond_to_group_invite", {
    p_group_id: groupId,
    p_accept: accept,
    p_asset_id: assetId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

// Open groups join straight away; listed groups return status 'requested' and
// wait on the owner.
export async function joinGroup(supabase, { groupId, assetId }) {
  const { data, error } = await supabase.rpc("join_group", {
    p_group_id: groupId,
    p_asset_id: assetId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

export async function reviewGroupJoinRequest(supabase, { groupId, userId, approve }) {
  const { data, error } = await supabase.rpc("review_group_join_request", {
    p_group_id: groupId,
    p_user_id: userId,
    p_approve: approve,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

export async function leaveGroup(supabase, groupId) {
  const { data, error } = await supabase.rpc("leave_group", {
    p_group_id: groupId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

export async function removeGroupMember(supabase, { groupId, userId }) {
  const { data, error } = await supabase.rpc("remove_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

export async function closeGroup(supabase, groupId) {
  const { data, error } = await supabase.rpc("close_group", {
    p_group_id: groupId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}

// Owner-only. Wraps the matcher: the owner's candidates, filtered by the
// group's Track, minus anyone already in or on their way in, minus anyone who
// fails a separation preference against ANY current member.
export async function recommendGroupMembers(supabase, { groupId, limit = 10 }) {
  const { data, error } = await supabase.rpc("recommend_group_members", {
    p_group_id: groupId,
    p_limit: limit,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data ?? [];
}

// A pairing inside a group: both assets come off the group_members rows, and
// the match is exempt from monthly quota and the concurrency cap. Inherits the
// Phase A surface gate from create_match on purpose — when the surface flips
// to Discord, pairing happens in the room.
export async function pairInGroup(supabase, { groupId, otherUserId, previousMatchId = null }) {
  const { data, error } = await supabase.rpc("pair_in_group", {
    p_group_id: groupId,
    p_other_user_id: otherUserId,
    p_previous_match_id: previousMatchId,
  });

  if (error) throw error;
  return data;
}

// Change what you bring, or refill a seat whose asset was deleted (the FK
// sets it null rather than blocking the deletion). Leaving and rejoining
// would work too, and would spend one of the month's groups.
export async function setGroupAsset(supabase, { groupId, assetId }) {
  const { data, error } = await supabase.rpc("set_group_asset", {
    p_group_id: groupId,
    p_asset_id: assetId,
    p_acting_user_id: null,
  });

  if (error) throw error;
  return data;
}
