"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ME, ME_PROFILE, HISTORY_ITEMS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Av, Stars, Btn, Card, Pill, PlanPill } from "@/components/fivestarz/ui";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, listMyAssets, listMyMatches, submitFeedback, rateFeedback, requestReviewPost, listMyProofLabListings, getProofLabCategories, createProofLabListing, updateProofLabListing, setProofLabListingStatus, listIncomingDealRequests, listOutgoingDealRequests, acceptProofLabDeal, declineProofLabDeal, cancelProofLabDeal, markProofLabDealFulfilled, confirmProofLabDeal, getCharities, getFundraiserLeaderboard, createProofLabReview, getProofLabReviewsForSeller } from "@/lib/fivestarz/data";
import { ASSET_TYPE_DB_TO_LABEL, PROOF_LAB_TIMEFRAME_LABEL } from "@/lib/fivestarz/enums";

const DEAL_STATUS_META = {
  pending: { label: "Pending", color: T.gold, bg: T.goldL + "55" },
  accepted: { label: "Accepted", color: T.teal, bg: T.tealP },
  fulfilled: { label: "Fulfilled", color: T.orange, bg: T.orangeP },
  completed: { label: "Completed", color: T.green, bg: T.greenP },
  declined: { label: "Declined", color: T.brownL, bg: T.cream },
  cancelled: { label: "Cancelled", color: T.brownL, bg: T.cream },
};

function formatPrice(cents) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Completion-confirmation controls for a fulfilled deal, from one side's view.
function DealConfirmBlock({ deal, perspective, busy, onConfirm }) {
  const mine = perspective === "seller" ? deal.seller_confirmed_at : deal.buyer_confirmed_at;
  const theirs = perspective === "seller" ? deal.buyer_confirmed_at : deal.seller_confirmed_at;
  const theirLabel = perspective === "seller" ? "Buyer" : "Seller";
  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {mine
        ? <span style={{ fontSize: 12, color: T.green, fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}>You confirmed ✓</span>
        : <Btn sz="sm" v="teal" disabled={busy} onClick={onConfirm}>{busy ? "…" : "Confirm Completed"}</Btn>}
      <span style={{ fontSize: 12, color: theirs ? T.green : T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
        {theirs ? `${theirLabel} confirmed ✓` : `Awaiting ${theirLabel.toLowerCase()}`}
      </span>
    </div>
  );
}
function dollarsToCents(v) {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
function centsToDollars(cents) {
  return cents === null || cents === undefined ? "" : String(cents / 100);
}

const PLAN_DISPLAY_NAME = { sprout: "Sprout", bloom: "Bloom", flourish: "Flourish" };
const ASSET_TYPE_EMOJI = {
  service_consulting: "🚀",
  advisory_skills: "🧠",
  physical_product: "📦",
  digital_product_saas: "💻",
  content_podcast_video: "🎙️",
  ecommerce_store: "🛍️",
  free_session_consultation: "🗓️",
  client_asset: "🤝",
};
function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RateFeedbackWidget({ feedbackSubmissionId, initialRating }) {
  const [rating, setRating] = useState(initialRating || 0);
  const [hover, setHover] = useState(0);
  const [saved, setSaved] = useState(initialRating != null);
  const [saving, setSaving] = useState(false);
  const save = async n => {
    setSaving(true);
    try {
      const supabase = createClient();
      await rateFeedback(supabase, { feedbackSubmissionId, stars: n });
      setRating(n);
      setSaved(true);
    } catch (err) {
      window.alert(err.message || "Could not save your rating.");
    } finally {
      setSaving(false);
    }
  };
  if (saved && rating > 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Stars n={rating} size={13} />
        <span style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Feedback rated</span>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Rate their feedback</div>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map(n => (
          <svg key={n} width={18} height={18} viewBox="0 0 20 20" fill={(hover || rating) >= n ? T.gold : "#E2D9D0"}
            style={{ cursor: "pointer", transition: "transform 0.1s", transform: (hover || rating) >= n ? "scale(1.2)" : "scale(1)" }}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => save(n)}>
            <path d="M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z" />
          </svg>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage({ userId }) {
  const router = useRouter();
  const [tab, setTab] = useState("matches");
  const [fbModal, setFbModal] = useState(null);
  const [postModal, setPostModal] = useState(null);
  const isMobile = useIsMobile();
  const hideHeaderIdentityText = useIsMobile(1024);
  const [profile, setProfile] = useState(null);
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const sc = {
    matched: { label: "New Match", color: T.gold, bg: T.goldL + "55" },
    accepted: { label: "New Match", color: T.gold, bg: T.goldL + "55" },
    feedback_pending: { label: "Feedback Due", color: T.orange, bg: T.orangeP },
    awaiting_post: { label: "Post Requested", color: T.teal, bg: T.tealP },
    posted: { label: "Publicly Shared ✓", color: T.green, bg: T.greenP },
    completed: { label: "Completed", color: T.green, bg: T.greenP },
    queued_next_month: { label: "Queued", color: T.brownL, bg: T.cream },
    cancelled: { label: "Cancelled", color: T.brownL, bg: T.cream },
  };

  const refreshMatches = async (supabase) => {
    const rows = await listMyMatches(supabase, userId);
    setMatches(rows);
    setMatchesLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [profileRow, assetRows] = await Promise.all([
        getMyProfile(supabase, userId),
        listMyAssets(supabase, userId),
      ]);
      if (cancelled) return;
      setProfile(profileRow);
      setAssets(assetRows);
      setAssetsLoading(false);
      await refreshMatches(supabase);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const displayName = profile?.display_name || "…";
  const planCode = profile?.plan_code || "sprout";
  const planName = PLAN_DISPLAY_NAME[planCode] || planCode;
  const planTier = planCode === "sprout" ? "free" : "paid";
  const degrees = profile?.degrees_of_separation ?? ME.degrees;

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "24px 16px 0" : "40px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: isMobile ? 18 : 24, marginBottom: isMobile ? 20 : 32 }}>
            <div style={{ display: "flex", gap: hideHeaderIdentityText ? 0 : (isMobile ? 12 : 16), alignItems: "center", minWidth: 0 }}>
              <Av txt={initials(displayName) || ME.avatar} color={T.orange} size={isMobile ? 46 : 52} />
              {!hideHeaderIdentityText && <div style={{ minWidth: 0 }}><div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#C4A68A", fontWeight: 600, marginBottom: 4 }}>Welcome back,</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 22 : 26, fontWeight: 800, color: "#fff", lineHeight: 1.15 }}>{displayName}</div></div>}
            </div>
            <div style={{ textAlign: isMobile ? "left" : "right", width: isMobile ? "100%" : "auto" }}>
              <PlanPill plan={planTier} planName={planName} />
              <div style={{ marginTop: 10, display: "flex", gap: isMobile ? 8 : 20, justifyContent: isMobile ? "space-between" : "flex-start", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                {[["4/12", "Matches"], ["2/6", "Browse"], [`${degrees}°`, "Separation"]].map(([v, l]) => (
                  <div key={l} style={{ textAlign: "center", flex: isMobile ? 1 : "0 0 auto", minWidth: 0 }}>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 18 : 20, fontWeight: 800, color: "#fff" }}>{v}</div>
                    <div style={{ fontSize: isMobile ? 10 : 11, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: isMobile ? 8 : 16 }}>
            {[["📦", "Assets", assets.length], ["✅", "Posted", 14], ["✍️", "Pending", 2], ["🤝", "Matches", "4/12"]].map(([ic, lbl, val]) => (
              <div key={lbl} style={{ background: "rgba(255,255,255,0.1)", borderRadius: "14px 14px 0 0", padding: isMobile ? "12px 8px" : "16px 20px", backdropFilter: "blur(8px)", minWidth: 0, textAlign: isMobile ? "center" : "left" }}>
                <div style={{ fontSize: isMobile ? 18 : 20, marginBottom: 6 }}>{ic}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 18 : 24, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{val}</div>
                <div style={{ fontSize: isMobile ? 10 : 12, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif" }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            {[["matches", "🤝 Matches"], ["assets", "📦 Assets"], ["history", "📜 History"], ["profile", "👤 Profile"], ["prooflab", "🧪 Proof Lab"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: isMobile ? "10px 14px" : "12px 24px", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: isMobile ? 13 : 14, borderRadius: "10px 10px 0 0", background: tab === id ? T.cream : "transparent", color: tab === id ? T.brown : "#C4A68A", transition: "all 0.2s", flex: isMobile ? "1 1 0" : "0 0 auto" }}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "20px 16px" : "28px 32px" }}>
        {tab === "matches" && (

          <div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 12 : 16, marginBottom: 20 }}>
              <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>Your Matches</h3>
              <Btn sz="sm" v="teal" onClick={() => router.push("/browse")} sx={isMobile ? { width: "100%", justifyContent: "center" } : {}}>+ Browse Members</Btn>
            </div>
            {matchesLoading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Loading your matches…</div>
            ) : matches.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>No matches yet. Browse members to request your first one.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {matches.map(m => {
                  const s = sc[m.status] || { label: m.status, color: T.brownL, bg: T.cream };
                  const bothSubmitted = m.myFeedback && m.theirFeedback;
                  return (
                    <Card key={m.id} sx={{ padding: isMobile ? "16px" : "20px 24px" }}>
                      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 12 : 16, flexDirection: isMobile ? "column" : "row" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                          <Av txt={initials(m.otherDisplayName)} color={T.orange} size={44} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 6 : 10, marginBottom: 4 }}>
                              <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 16, color: T.brown }}>{m.otherDisplayName}</span>
                              <Pill color={s.color} bg={s.bg}>{s.label}</Pill>
                            </div>
                            <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.45 }}>You&rsquo;re reviewing <strong>{m.theirAsset.name}</strong> · {ASSET_TYPE_DB_TO_LABEL[m.theirAsset.asset_type] || m.theirAsset.asset_type}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{m.theirAsset.asset_channels.map(c => <Pill key={c.channel_name} color={T.brownL} bg={T.cream}>{c.channel_name}</Pill>)}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexDirection: "column", alignItems: isMobile ? "stretch" : "flex-end", width: isMobile ? "100%" : "auto" }}>
                          {!m.myFeedback && m.status !== "cancelled" && m.status !== "queued_next_month" && <Btn sz="sm" onClick={() => setFbModal(m)} sx={isMobile ? { width: "100%", justifyContent: "center" } : {}}>Leave Feedback</Btn>}
                          {m.myFeedback && !m.theirFeedback && <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Feedback sent — waiting on their feedback</div>}
                          {bothSubmitted && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "stretch" : "flex-end", gap: 6, width: isMobile ? "100%" : "auto" }}>
                              {m.theirFeedbackPostRequest?.status === "posted" ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.green, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>✓ Posted to {m.theirFeedbackPostRequest.requested_channel_name}</div>
                              ) : m.theirFeedbackPostRequest ? (
                                <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Post requested · {m.theirFeedbackPostRequest.status}</div>
                              ) : (
                                <Btn sz="sm" v="teal" onClick={() => setPostModal(m)} sx={isMobile ? { width: "100%", justifyContent: "center" } : {}}>Request Post</Btn>
                              )}
                              <RateFeedbackWidget feedbackSubmissionId={m.theirFeedback.id} initialRating={m.theirFeedbackMyRating} />
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "assets" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, minWidth: 0 }}>
              <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0, minWidth: 0 }}>My Assets</h3>
              <Btn sz="sm" onClick={() => router.push("/assets/new")} sx={{ marginLeft: "auto", flexShrink: 0 }}>+ Add Asset</Btn>
            </div>
            {assetsLoading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Loading your assets…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
                {assets.map(a => {
                  const typeLabel = ASSET_TYPE_DB_TO_LABEL[a.asset_type] || a.asset_type;
                  const isAdvisory = a.asset_type === "advisory_skills";
                  return (
                    <Card key={a.id} sx={{ padding: 28 }}>
                      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: isAdvisory ? T.purpleP : T.orangeP, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{ASSET_TYPE_EMOJI[a.asset_type] || "📦"}</div>
                        <div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown }}>{a.name}</div><div style={{ fontSize: 12, color: T.teal, fontFamily: "'DM Sans',sans-serif" }}>{a.public_url}</div>{isAdvisory && <Pill color={T.purple} bg={T.purpleP} sx={{ marginTop: 4, fontSize: 10 }}>Advisory Skills</Pill>}</div>
                      </div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1, background: T.cream, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown }}>0</div><div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>Posted</div></div>
                        <div style={{ flex: 1, background: T.cream, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown }}>0</div><div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>Pending</div></div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>{a.asset_channels.map(c => <Pill key={c.channel_name} color={T.teal} bg={T.tealP}>{c.channel_name}</Pill>)}</div>
                      <div style={{ display: "flex", gap: 8 }}><Btn sz="sm" v="ghost" sx={{ flex: 1, justifyContent: "center" }}>Edit</Btn><Btn sz="sm" sx={{ flex: 1, justifyContent: "center", background: T.cream, color: T.brown, border: `1.5px solid #E8DDD5`, boxShadow: "none" }}>Feedback</Btn></div>
                    </Card>
                  );
                })}
                <Card sx={{ padding: 28, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${T.orangeP}`, background: T.cream }} hover={false}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>+</div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown, marginBottom: 12 }}>Add New Asset</div>
                  <Btn sz="sm" onClick={() => router.push("/assets/new")}>+ Add Asset</Btn>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div>
            <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, marginBottom: 20 }}>Review History</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {HISTORY_ITEMS.map((r, i) => (
                <Card key={i} sx={{ padding: isMobile ? "16px" : "18px 24px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: isMobile ? 10 : 14 }}>
                    <Av txt={r.person.split(" ").map(n => n[0]).join("")} color={[T.gold, T.brown, T.teal][i % 3]} size={isMobile ? 36 : 40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", gap: isMobile ? 4 : 12 }}>
                        <div style={{ minWidth: 0 }}><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, color: T.brown }}>{r.person}</span><span style={{ color: T.brownL, fontSize: 13, fontFamily: "'DM Sans',sans-serif", display: isMobile ? "block" : "inline" }}>{isMobile ? r.asset : ` · ${r.asset}`}</span></div>
                        <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{r.date}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 6 : 10, margin: "6px 0 8px" }}><Stars n={r.stars} size={14} /><Pill color={T.green} bg={T.greenP}>✓ {r.ch}</Pill></div>
                      <div style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, fontStyle: "italic" }}>&ldquo;{r.snippet}&rdquo;</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Profile Tab ── */}
        {tab === "profile" && (
          <div>
            {/* Header card */}
            <Card sx={{ padding: isMobile ? 20 : 28, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: isMobile ? 14 : 20, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
                <Av txt={initials(displayName)} color={T.orange} size={isMobile ? 64 : 80} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 22 : 26, fontWeight: 800, color: T.brown }}>{displayName}</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: T.brownM, fontWeight: 600, marginTop: 2 }}>{ME_PROFILE.title}</div>
                    </div>
                    <Btn sz="sm" v="ghost">Edit Profile</Btn>
                  </div>
                  <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, margin: "12px 0 14px" }}>{profile?.bio || ME_PROFILE.bio}</p>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {[["📍", profile?.location_text || ME_PROFILE.location], ["🌐", ME_PROFILE.website], ["💼", ME_PROFILE.linkedin]].map(([icon, val]) => (
                      <span key={val} style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5 }}>{icon} {val}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* ProofSignals stats */}
            <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 20 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: T.brown, marginBottom: 16 }}>ProofSignals Member Indicators</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap: isMobile ? 12 : 16 }}>
                {[
                  ["Plan", planName, T.orange],
                  ["⭐ Avg Rating", (profile?.feedback_rating_avg ?? 0).toFixed(1), T.gold],
                  ["Rated Exchanges", profile?.feedback_rating_count ?? 0, T.teal],
                  ["Separation", `${degrees}°`, T.purple],
                  ["Member Since", profile?.created_at ? new Date(profile.created_at).toLocaleString("default", { month: "short", year: "numeric" }) : "—", T.brownL],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: T.cream, borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Review channel presence */}
            <Card sx={{ padding: isMobile ? 18 : 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: T.brown }}>Online Review Channel Presence</div>
                <Btn sz="sm" v="ghost">+ Add Channel</Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 12 }}>
                {ME_PROFILE.channels.map(ch => (
                  <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${ch.active ? T.green + "55" : "#E8DDD5"}`, background: ch.active ? T.greenP : T.cream }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: ch.active ? T.green : "#CCC4BC", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, color: T.brown, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.name}</div>
                      <div style={{ fontSize: 11, color: ch.active ? T.green : T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{ch.active ? "Active" : "Not yet active"}</div>
                    </div>
                    {ch.active && <Btn sz="sm" v="ghost" sx={{ padding: "3px 10px", fontSize: 11, flexShrink: 0 }}>View</Btn>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Proof Lab Listings Tab ── */}
        {tab === "prooflab" && (
          <ProofLabListingsTab isMobile={isMobile} userId={userId} planCode={planCode} assets={assets} />
        )}
      </div>

      {fbModal && (
        <FeedbackModal
          match={fbModal}
          onClose={() => setFbModal(null)}
          onSubmitted={async () => {
            const supabase = createClient();
            await refreshMatches(supabase);
          }}
        />
      )}
      {postModal && (
        <PostModal
          match={postModal}
          onClose={() => setPostModal(null)}
          onSubmitted={async () => {
            const supabase = createClient();
            await refreshMatches(supabase);
          }}
        />
      )}
    </div>
  );
}


function ProofLabListingsTab({ isMobile, userId, planCode, assets }) {
  const [listings, setListings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [requests, setRequests] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [charities, setCharities] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [gate, setGate] = useState({ enabled: false, limit: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [dealBusyId, setDealBusyId] = useState(null);
  const [editModal, setEditModal] = useState(null); // { listing } for edit, {} for new
  const [reviewModal, setReviewModal] = useState(null); // deal being reviewed
  const [addMsg, setAddMsg] = useState(false);

  const load = async (supabase) => {
    const [rows, cats, reqs, outReqs, chars, board, revs, { data: gateRow }] = await Promise.all([
      listMyProofLabListings(supabase, userId),
      getProofLabCategories(supabase),
      listIncomingDealRequests(supabase, userId),
      listOutgoingDealRequests(supabase, userId),
      getCharities(supabase),
      getFundraiserLeaderboard(supabase),
      getProofLabReviewsForSeller(supabase, userId),
      supabase.from("plan_feature_gates").select("enabled, limit_int").eq("plan_code", planCode).eq("feature_key", "max_proof_lab_listings").maybeSingle(),
    ]);
    setListings(rows);
    setCategories(cats);
    setRequests(reqs);
    setOutgoing(outReqs);
    setCharities(chars);
    setLeaderboard(board);
    setReviews(revs);
    setGate({ enabled: gateRow?.enabled ?? false, limit: gateRow?.limit_int ?? null });
  };

  // Runs a lifecycle transition RPC then refreshes both request lists.
  const runDealAction = async (fn, dealId) => {
    setDealBusyId(dealId);
    setError("");
    try {
      const supabase = createClient();
      await fn(supabase, dealId);
      await load(supabase);
    } catch (err) {
      setError(err.message || "Could not update this deal request.");
    } finally {
      setDealBusyId(null);
    }
  };

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        await load(supabase);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load your listings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, planCode]);

  const activeCnt = listings.filter(l => l.status === "active").length;
  const planLimit = gate.limit;
  const atLimit = planLimit !== null && activeCnt >= planLimit;
  const canAdd = gate.enabled && (planLimit === null || planLimit > 0) && !atLimit;
  const planName = PLAN_DISPLAY_NAME[planCode] || planCode;

  const changeStatus = async (listing, status) => {
    setBusyId(listing.id);
    setError("");
    try {
      const supabase = createClient();
      await setProofLabListingStatus(supabase, listing.id, status);
      await load(supabase);
    } catch (err) {
      setError(err.message || "Could not update the listing.");
    } finally {
      setBusyId(null);
    }
  };

  // Buyer-side requests are available on any plan (requesting a deal isn't
  // plan-gated), so this renders in both the gated and ungated returns.
  const outgoingSection = (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.brown, margin: "0 0 14px" }}>My Deal Requests {outgoing.length > 0 && <span style={{ fontSize: 14, color: T.orange }}>({outgoing.length})</span>}</h3>
      {outgoing.length === 0 ? (
        <div style={{ padding: "20px 22px", background: T.cream, borderRadius: 14, fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>You haven&rsquo;t requested any deals yet. Browse the <a href="/proof-lab" style={{ color: T.teal, fontWeight: 700 }}>Proof Lab →</a></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {outgoing.map(r => {
            const meta = DEAL_STATUS_META[r.status] || { label: r.status, color: T.brownL, bg: T.cream };
            const busy = dealBusyId === r.id;
            const canCancel = r.status === "pending" || r.status === "accepted";
            const myReview = Array.isArray(r.review) ? r.review[0] : r.review;
            return (
              <Card key={r.id} sx={{ padding: isMobile ? "14px 16px" : "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{r.listing?.title || "Listing"}</span>
                  <Pill color={meta.color} bg={meta.bg}>{meta.label}</Pill>
                </div>
                <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                  To <strong>{r.seller?.display_name || "seller"}</strong> · {PROOF_LAB_TIMEFRAME_LABEL[r.timeframe] || r.timeframe}
                </div>
                {canCancel && (
                  <div style={{ marginTop: 10 }}>
                    <Btn sz="sm" v="ghost" disabled={busy} onClick={() => runDealAction(cancelProofLabDeal, r.id)}>{busy ? "…" : "Cancel Request"}</Btn>
                  </div>
                )}
                {r.status === "fulfilled" && <DealConfirmBlock deal={r} perspective="buyer" busy={busy} onConfirm={() => runDealAction(confirmProofLabDeal, r.id)} />}
                {r.status === "completed" && (
                  <div style={{ marginTop: 10 }}>
                    {myReview
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>You reviewed <Stars n={myReview.stars} size={13} /></span>
                      : <Btn sz="sm" v="teal" onClick={() => setReviewModal(r)}>★ Leave Review</Btn>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center", fontSize: 14, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Loading…</div>;

  if (!gate.enabled) {
    return (
      <div>
        <div style={{ padding: "28px 24px", background: T.orangeP, borderRadius: 16, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🧪</div>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.brown, margin: "0 0 8px" }}>Proof Lab listings are a paid feature</h3>
          <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", maxWidth: 420, margin: "0 auto 18px" }}>Upgrade to Bloom or Flourish to offer members-only deals in the Proof Lab.</p>
          <Btn v="teal" onClick={() => { window.location.href = "/pricing"; }}>See Plans →</Btn>
        </div>
        {error && <div style={{ padding: "12px 16px", background: "#FFE5E5", borderRadius: 12, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginTop: 16 }}>⚠️ {error}</div>}
        {outgoingSection}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>My Proof Lab Listings</h3>
        <div style={{ position: "relative" }}>
          <Btn sz="sm" v={canAdd ? "teal" : "ghost"}
            onClick={() => canAdd ? setEditModal({}) : setAddMsg(v => !v)}
            onMouseEnter={() => !canAdd && setAddMsg(true)}
            onMouseLeave={() => setAddMsg(false)}>
            + Add New Listing
          </Btn>
          {addMsg && !canAdd && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 260, background: T.brown, color: "#fff", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, zIndex: 10, boxShadow: "0 8px 24px rgba(61,43,31,0.25)" }}>
              <strong>{planName} Tier: {activeCnt} of {planLimit} Listings Active.</strong><br />De-activate one to add or activate a different one.
              <div style={{ position: "absolute", top: -6, right: 20, width: 12, height: 12, background: T.brown, transform: "rotate(45deg)", borderRadius: 2 }} />
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ padding: "12px 16px", background: "#FFE5E5", borderRadius: 12, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>⚠️ {error}</div>}

      {listings.length === 0 && (
        <div style={{ padding: "28px 24px", background: T.cream, borderRadius: 16, textAlign: "center", marginBottom: 20 }}>
          <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", margin: 0 }}>You haven&rsquo;t posted any deals yet. Add your first listing to appear in the Proof Lab.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {listings.map(l => {
          const active = l.status === "active";
          const busy = busyId === l.id;
          return (
            <Card key={l.id} sx={{ padding: 0, overflow: "hidden", border: `2px solid ${active ? T.green + "55" : "#E8DDD5"}` }}>
              <div style={{ height: 4, background: active ? T.green : "#C8BFB5" }} />
              <div style={{ padding: isMobile ? "16px" : "18px 22px", display: "flex", alignItems: "flex-start", gap: 16, flexDirection: isMobile ? "column" : "row" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{l.title}</span>
                    {active
                      ? <Pill color={T.green} bg={T.greenP}>● Active</Pill>
                      : <Pill color={T.brownL} bg={T.cream}>{l.status === "archived" ? "Archived" : "Inactive"}</Pill>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, fontFamily: "'DM Sans',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{l.category?.label || l.category_slug}</div>
                  <p style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, margin: "0 0 10px" }}>{l.description}</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 900, color: T.orange }}>{formatPrice(l.member_price_cents)}</span>
                    <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", textDecoration: "line-through" }}>{formatPrice(l.retail_price_cents)}</span>
                    <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l.price_unit}</span>
                  </div>
                  {l.donation_percent && <div style={{ marginTop: 8 }}><span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", color: T.green, background: T.greenP, padding: "3px 9px", borderRadius: 12 }}>💚 {l.donation_percent}% to {l.charity?.logo_emoji ? `${l.charity.logo_emoji} ` : ""}{l.charity?.name || "charity"}</span></div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: isMobile ? "stretch" : "center" }}>
                  <Btn sz="sm" v="ghost" disabled={busy} onClick={() => setEditModal({ listing: l })} sx={isMobile ? { flex: 1, justifyContent: "center" } : {}}>Edit</Btn>
                  <Btn sz="sm" v={active ? "ghost" : "teal"} disabled={busy || (!active && !canAdd)} onClick={() => changeStatus(l, active ? "inactive" : "active")} sx={isMobile ? { flex: 1, justifyContent: "center" } : {}}>
                    {busy ? "…" : active ? "De-activate" : "Activate"}
                  </Btn>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div style={{ marginTop: 20, padding: "14px 18px", background: T.tealP, borderRadius: 12, fontSize: 13, color: T.teal, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
        🧪 {planName} Tier: {activeCnt} of {planLimit === null ? "∞" : planLimit} listings active · <a href="/proof-lab" style={{ color: T.teal, fontWeight: 700 }}>View them in the Proof Lab →</a>
      </div>

      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.brown, margin: "0 0 14px" }}>Incoming Deal Requests {requests.length > 0 && <span style={{ fontSize: 14, color: T.orange }}>({requests.length})</span>}</h3>
        {requests.length === 0 ? (
          <div style={{ padding: "20px 22px", background: T.cream, borderRadius: 14, fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>No deal requests yet. When a member requests one of your listings, it&rsquo;ll show up here.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {requests.map(r => {
              const meta = DEAL_STATUS_META[r.status] || { label: r.status, color: T.brownL, bg: T.cream };
              const busy = dealBusyId === r.id;
              return (
                <Card key={r.id} sx={{ padding: isMobile ? "14px 16px" : "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{r.listing?.title || "Listing"}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <Pill color={meta.color} bg={meta.bg}>{meta.label}</Pill>
                      <Pill color={T.brownM} bg={T.cream}>{PROOF_LAB_TIMEFRAME_LABEL[r.timeframe] || r.timeframe}</Pill>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: r.note ? 6 : 0 }}>
                    From <strong>{r.requester?.display_name || "A member"}</strong> · <a href={`mailto:${r.requester_email}`} style={{ color: T.teal, fontWeight: 700 }}>{r.requester_email}</a>
                  </div>
                  {r.note && <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", fontStyle: "italic", marginBottom: 4 }}>&ldquo;{r.note}&rdquo;</div>}
                  {(r.status === "pending" || r.status === "accepted") && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {r.status === "pending" && <Btn sz="sm" v="teal" disabled={busy} onClick={() => runDealAction(acceptProofLabDeal, r.id)}>{busy ? "…" : "Accept"}</Btn>}
                      {r.status === "accepted" && <Btn sz="sm" v="teal" disabled={busy} onClick={() => runDealAction(markProofLabDealFulfilled, r.id)}>{busy ? "…" : "Mark Fulfilled"}</Btn>}
                      <Btn sz="sm" v="ghost" disabled={busy} onClick={() => runDealAction(declineProofLabDeal, r.id)}>{busy ? "…" : "Decline"}</Btn>
                    </div>
                  )}
                  {r.status === "fulfilled" && <DealConfirmBlock deal={r} perspective="seller" busy={busy} onConfirm={() => runDealAction(confirmProofLabDeal, r.id)} />}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {outgoingSection}

      {leaderboard.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.brown, margin: "0 0 6px" }}>🏆 Fundraiser Leaderboard</h3>
          <p style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", margin: "0 0 14px" }}>Total pledged to charity across members&rsquo; completed Proof Lab deals.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {leaderboard.map((row, i) => (
              <div key={row.seller_user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: i === 0 ? T.goldL + "33" : T.cream, borderRadius: 12, border: `1px solid ${i === 0 ? T.gold + "66" : "#EDE4DA"}` }}>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 900, color: i === 0 ? T.gold : T.brownL, minWidth: 28 }}>{i + 1}</span>
                <span style={{ flex: 1, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, minWidth: 0 }}>{row.display_name || "Member"}{row.seller_user_id === userId && <span style={{ color: T.orange }}> (you)</span>}</span>
                <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{row.completed_deals} deal{row.completed_deals !== 1 ? "s" : ""}</span>
                <span style={{ fontFamily: "'Fraunces',serif", fontWeight: 800, fontSize: 16, color: T.green }}>{formatPrice(Number(row.total_pledged_cents))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.brown, margin: "0 0 14px" }}>Reviews Received {reviews.length > 0 && <span style={{ fontSize: 14, color: T.orange }}>({reviews.length})</span>}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviews.map(rv => (
              <Card key={rv.id} sx={{ padding: isMobile ? "14px 16px" : "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: rv.written_review ? 6 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Stars n={rv.stars} size={14} />
                    <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>on <strong>{rv.listing?.title || "your listing"}</strong></span>
                  </div>
                  <Pill color={T.green} bg={T.greenP}>Engaged Buyer ✓</Pill>
                </div>
                {rv.written_review && <p style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", fontStyle: "italic", margin: 0 }}>&ldquo;{rv.written_review}&rdquo; <span style={{ fontStyle: "normal", color: T.brownL }}>— {rv.reviewer?.display_name || "A member"}</span></p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {editModal && (
        <ProofLabListingModal
          listing={editModal.listing}
          categories={categories}
          assets={assets}
          charities={charities}
          onClose={() => setEditModal(null)}
          onSaved={async () => {
            const supabase = createClient();
            await load(supabase);
            setEditModal(null);
          }}
        />
      )}

      {reviewModal && (
        <ProofLabReviewModal
          deal={reviewModal}
          onClose={() => setReviewModal(null)}
          onSaved={async () => {
            const supabase = createClient();
            await load(supabase);
            setReviewModal(null);
          }}
        />
      )}
    </div>
  );
}

function ProofLabListingModal({ listing, categories, assets, charities, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const isEdit = !!listing;
  const [form, setForm] = useState({
    title: listing?.title || "",
    description: listing?.description || "",
    categorySlug: listing?.category_slug || categories[0]?.slug || "",
    retail: centsToDollars(listing?.retail_price_cents),
    member: centsToDollars(listing?.member_price_cents),
    priceUnit: listing?.price_unit || "",
    badge: listing?.badge || "",
    assetId: listing?.asset_id || "",
    donationPercent: listing?.donation_percent != null ? String(listing.donation_percent) : "",
    charityId: listing?.charity_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const pct = form.donationPercent.trim() === "" ? null : parseInt(form.donationPercent, 10);
      const payload = {
        title: form.title,
        description: form.description,
        categorySlug: form.categorySlug,
        retailPriceCents: dollarsToCents(form.retail),
        memberPriceCents: dollarsToCents(form.member),
        priceUnit: form.priceUnit,
        badge: form.badge,
        assetId: form.assetId || null,
        donationPercent: pct,
        charityId: pct === null ? null : form.charityId || null,
      };
      if (isEdit) await updateProofLabListing(supabase, listing.id, payload);
      else await createProofLabListing(supabase, payload);
      await onSaved();
    } catch (err) {
      setError(err.message || "Could not save this listing.");
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 24, padding: isMobile ? "24px 18px" : "30px 32px", maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 20px" }}>{isEdit ? "Edit Listing" : "New Proof Lab Listing"}</h2>

        <div style={{ marginBottom: 14 }}><label style={labelStyle}>Title *</label><input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Sales Page Copywriting" style={inputStyle} /></div>
        <div style={{ marginBottom: 14 }}><label style={labelStyle}>Description *</label><textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="What the buyer gets…" style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} /></div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Category *</label>
          <select value={form.categorySlug} onChange={e => set("categorySlug", e.target.value)} style={inputStyle}>
            {categories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Retail price ($)</label><input value={form.retail} onChange={e => set("retail", e.target.value)} placeholder="1200" inputMode="decimal" style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Member price ($)</label><input value={form.member} onChange={e => set("member", e.target.value)} placeholder="149" inputMode="decimal" style={inputStyle} /></div>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Unit</label><input value={form.priceUnit} onChange={e => set("priceUnit", e.target.value)} placeholder="per page" style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Badge</label><input value={form.badge} onChange={e => set("badge", e.target.value)} placeholder="🔥 Hot Deal" style={inputStyle} /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Link a reviewed asset <span style={{ fontWeight: 400, color: T.brownL }}>(optional — adds a “verified proof” badge)</span></label>
          <select value={form.assetId} onChange={e => set("assetId", e.target.value)} style={inputStyle}>
            <option value="">None</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 20, padding: 14, background: T.greenP, borderRadius: 12 }}>
          <label style={labelStyle}>💚 Donate to charity <span style={{ fontWeight: 400, color: T.brownL }}>(optional — shows a badge to buyers)</span></label>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 110 }}>
              <input value={form.donationPercent} onChange={e => set("donationPercent", e.target.value.replace(/[^0-9]/g, ""))} placeholder="% e.g. 10" inputMode="numeric" style={inputStyle} />
            </div>
            <select value={form.charityId} onChange={e => set("charityId", e.target.value)} disabled={form.donationPercent.trim() === ""} style={{ ...inputStyle, flex: 1, opacity: form.donationPercent.trim() === "" ? 0.5 : 1 }}>
              <option value="">Select a charity…</option>
              {charities.map(c => <option key={c.id} value={c.id}>{c.logo_emoji ? `${c.logo_emoji} ` : ""}{c.name}</option>)}
            </select>
          </div>
          <p style={{ fontSize: 11, color: T.brownM, fontFamily: "'DM Sans',sans-serif", margin: "8px 0 0", lineHeight: 1.5 }}>Honor-system pledge based on the member price — FiveStarz doesn&rsquo;t process the donation.</p>
        </div>

        {error && <div style={{ padding: "10px 14px", background: "#FFE5E5", borderRadius: 10, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginBottom: 14 }}>⚠️ {error}</div>}
        <div style={{ display: "flex", gap: 12 }}>
          <Btn v="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn v="teal" onClick={save} disabled={saving || !form.title || !form.description || !form.categorySlug} sx={{ flex: 1, justifyContent: "center" }}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Create Listing"}</Btn>
        </div>
      </div>
    </div>
  );
}

function ProofLabReviewModal({ deal, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sellerName = deal.seller?.display_name || "the seller";
  const listingTitle = deal.listing?.title || "this deal";

  const save = async () => {
    if (!stars) return;
    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      await createProofLabReview(supabase, { dealId: deal.id, stars, written: text });
      await onSaved();
    } catch (err) {
      setError(err.message || "Could not submit your review.");
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 24, padding: isMobile ? "24px 18px" : "30px 32px", maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        <div style={{ display: "inline-flex", marginBottom: 8 }}><Pill color={T.green} bg={T.greenP}>Engaged Buyer ✓</Pill></div>
        <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>Review {sellerName}</h2>
        <p style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", margin: "0 0 20px" }}>For your completed deal: <strong>{listingTitle}</strong></p>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Your rating *</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <svg key={n} width={34} height={34} viewBox="0 0 20 20" fill={(hover || stars) >= n ? T.gold : "#E2D9D0"}
                style={{ cursor: "pointer", transition: "transform 0.1s", transform: (hover || stars) >= n ? "scale(1.1)" : "scale(1)" }}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setStars(n)}>
                <path d="M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z" />
              </svg>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Written review <span style={{ fontWeight: 400, color: T.brownL }}>(optional)</span></label>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What was working with them like?" style={{ width: "100%", minHeight: 90, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", boxSizing: "border-box" }} />
        </div>
        {error && <div style={{ padding: "10px 14px", background: "#FFE5E5", borderRadius: 10, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginBottom: 14 }}>⚠️ {error}</div>}
        <div style={{ display: "flex", gap: 12 }}>
          <Btn v="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn v="teal" onClick={save} disabled={saving || !stars} sx={{ flex: 1, justifyContent: "center" }}>{saving ? "Submitting…" : "Submit Review"}</Btn>
        </div>
      </div>
    </div>
  );
}

function FeedbackModal({ match, onClose, onSubmitted }) {
  const isMobile = useIsMobile();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cats, setCats] = useState({ quality: 0, value: 0, communication: 0 });

  const submit = async () => {
    if (!stars && !text) return;
    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      await submitFeedback(supabase, { matchId: match.id, stars, writtenFeedback: text, structuredFeedback: cats });
      await onSubmitted?.();
      setDone(true);
    } catch (err) {
      setError(err.message || "Could not submit your feedback.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 28, padding: isMobile ? "24px 18px" : "36px 40px", maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!done ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.orange, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Feedback For</div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: 0 }}>{match.otherDisplayName}</h2>
              <div style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>{match.theirAsset.name}</div>
            </div>
            <div style={{ background: T.warm, borderRadius: 14, padding: 14, marginBottom: 20, fontSize: 13, color: T.brownM, fontFamily: "'DM Sans',sans-serif" }}>💡 Be honest and specific. Use at least one format below.</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Overall Rating</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <span key={s} style={{ cursor: "pointer", fontSize: 32 }} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setStars(s)}>{s <= (hover || stars) ? "⭐" : "☆"}</span>
                ))}
                {stars > 0 && <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", alignSelf: "center", marginLeft: 6 }}>{["", "Poor", "Fair", "Good", "Great", "Excellent"][stars]}</span>}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 12, fontFamily: "'DM Sans',sans-serif" }}>Structured Categories</div>
              {Object.keys(cats).map(cat => (
                <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", textTransform: "capitalize" }}>{cat}</span>
                  <div style={{ display: "flex", gap: 4 }}>{[1, 2, 3, 4, 5].map(s => <button key={s} onClick={() => setCats(c => ({ ...c, [cat]: s }))} style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", background: s <= cats[cat] ? T.orange : T.orangeP, color: s <= cats[cat] ? "#fff" : T.orangeL, fontSize: 12, fontWeight: 700 }}>{s}</button>)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Written Feedback</div>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`Honest thoughts about ${match.otherDisplayName}'s ${match.theirAsset.name}...`} style={{ width: "100%", minHeight: 100, padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
            {error && <div style={{ padding: "12px 16px", background: "#FFE5E5", borderRadius: 12, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>⚠️ {error}</div>}
            <Btn onClick={submit} disabled={saving} sx={{ width: "100%", justifyContent: "center" }}>{saving ? "Submitting…" : "Submit Feedback"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🙌</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Feedback Submitted!</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>Your feedback for <strong>{match.otherDisplayName}</strong> has been saved privately inside ProofSignals. The recipient will be notified.</p>
            <Btn onClick={onClose}>Done</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function PostModal({ match, onClose, onSubmitted }) {
  const isMobile = useIsMobile();
  const [sel, setSel] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const channels = match.myAsset.asset_channels;

  const send = async () => {
    if (!sel) return;
    setSending(true);
    setError("");
    try {
      const supabase = createClient();
      await requestReviewPost(supabase, { feedbackSubmissionId: match.theirFeedback.id, channelName: sel });
      await onSubmitted?.();
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send this request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 28, padding: isMobile ? "24px 18px" : "36px 40px", maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!sent ? (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Request Post From</div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: 0 }}>{match.otherDisplayName}</h2>
            </div>
            <div style={{ padding: "12px 14px", background: T.tealP, borderRadius: 12, marginBottom: 20, fontSize: 13, color: T.teal, fontFamily: "'DM Sans',sans-serif" }}>✓ {match.otherDisplayName} is never obligated to post. This is a friendly request only.</div>
            {channels.length === 0 && <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>Your asset has no review channels set up yet.</div>}
            {channels.map(c => (
              <div key={c.channel_name} onClick={() => setSel(c.channel_name)} style={{ padding: "14px 18px", borderRadius: 12, marginBottom: 10, cursor: "pointer", border: `2px solid ${sel === c.channel_name ? T.teal : "#E8DDD5"}`, background: sel === c.channel_name ? T.tealP : "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: T.brown }}>{c.channel_name}</span>
                {sel === c.channel_name && <span style={{ color: T.teal }}>✓</span>}
              </div>
            ))}
            {error && <div style={{ padding: "12px 16px", background: "#FFE5E5", borderRadius: 12, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginTop: 12 }}>⚠️ {error}</div>}
            <Btn v="teal" onClick={send} disabled={!sel || sending} sx={{ width: "100%", justifyContent: "center", marginTop: 12, opacity: sel ? 1 : 0.5 }}>{sending ? "Sending…" : "Send Request"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📨</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Request Sent!</h2>
            <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}><strong>{match.otherDisplayName}</strong> has been notified. If they post to <strong>{sel}</strong>, you&rsquo;ll get a confirmation here.</p>
            <Btn onClick={onClose}>Done</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
