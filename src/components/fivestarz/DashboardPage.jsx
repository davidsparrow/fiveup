"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ME, ME_PROFILE, ME_PROOF_LISTINGS, HISTORY_ITEMS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Av, Stars, Btn, Card, Pill, PlanPill } from "@/components/fivestarz/ui";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, listMyAssets, listMyMatches, submitFeedback, rateFeedback, requestReviewPost } from "@/lib/fivestarz/data";
import { ASSET_TYPE_DB_TO_LABEL } from "@/lib/fivestarz/enums";

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
          <ProofLabListingsTab isMobile={isMobile} />
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


function ProofLabListingsTab({ isMobile }) {
  const [addMsg, setAddMsg] = useState(false);
  const activeCnt = ME_PROOF_LISTINGS.filter(l => l.active).length;
  const planLimit = 3; // Bloom tier
  const atLimit = activeCnt >= planLimit;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>My Proof Lab Listings</h3>
        <div style={{ position: "relative" }}>
          <Btn sz="sm" v={atLimit ? "ghost" : "teal"}
            onClick={() => atLimit && setAddMsg(v => !v)}
            onMouseEnter={() => atLimit && setAddMsg(true)}
            onMouseLeave={() => setAddMsg(false)}>
            + Add New Listing
          </Btn>
          {addMsg && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 260, background: T.brown, color: "#fff", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, zIndex: 10, boxShadow: "0 8px 24px rgba(61,43,31,0.25)" }}>
              <strong>Bloom Tier: {activeCnt} of {planLimit} Listings Active.</strong><br />De-activate one to add or activate a different one.
              <div style={{ position: "absolute", top: -6, right: 20, width: 12, height: 12, background: T.brown, transform: "rotate(45deg)", borderRadius: 2 }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {ME_PROOF_LISTINGS.map(l => (
          <Card key={l.id} sx={{ padding: 0, overflow: "hidden", border: `2px solid ${l.active ? T.green + "55" : "#E8DDD5"}` }}>
            <div style={{ height: 4, background: l.active ? T.green : "#C8BFB5" }} />
            <div style={{ padding: isMobile ? "16px" : "18px 22px", display: "flex", alignItems: "flex-start", gap: 16, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{l.title}</span>
                  {l.active
                    ? <Pill color={T.green} bg={T.greenP}>● Active</Pill>
                    : <Pill color={T.brownL} bg={T.cream}>Inactive</Pill>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, fontFamily: "'DM Sans',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{l.category}</div>
                <p style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, margin: "0 0 10px" }}>{l.desc}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 900, color: T.orange }}>{l.members}</span>
                  <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", textDecoration: "line-through" }}>{l.retail}</span>
                  <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l.unit}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: isMobile ? "stretch" : "center" }}>
                <Btn sz="sm" v="ghost" sx={isMobile ? { flex: 1, justifyContent: "center" } : {}}>Edit</Btn>
                <Btn sz="sm" v={l.active ? "ghost" : "teal"} sx={isMobile ? { flex: 1, justifyContent: "center" } : {}}>
                  {l.active ? "De-activate" : "Activate"}
                </Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: "14px 18px", background: T.tealP, borderRadius: 12, fontSize: 13, color: T.teal, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
        🧪 Bloom Tier: {activeCnt} of {planLimit} listings active · <a href="/proof-lab" style={{ color: T.teal, fontWeight: 700 }}>View your listings in the Proof Lab →</a>
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
