"use client";

import { useEffect, useState } from "react";
import { ASSET_TYPES, CHANNELS, FB_FORMATS, PLAN_OPTS, CREDIT_OPTS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Av, Btn, Card, Pill, PlanPill } from "@/components/fivestarz/ui";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, listMyAssets, getBrowseQuota, getEligibleCandidates, getChannelsAndFormatsForAssets, requestMatch, getPreviousMatches, getUsedChannelsForMatches } from "@/lib/fivestarz/data";
import { ASSET_TYPE_DB_TO_LABEL, FEEDBACK_FORMAT_DB_TO_SHORT_LABEL } from "@/lib/fivestarz/enums";

const AVATAR_COLORS = ["#7C3AED", "#1A9E8F", "#F4A832", "#FF6B35", "#6B4226", "#38A169", "#4A5568", "#A0644A"];
function colorForUser(userId) {
  const sum = Array.from(userId || "").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function BrowsePage({ userId }) {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" });
  const [matchModal, setMatchModal] = useState(null);

  const [myActiveAssets, setMyActiveAssets] = useState([]);
  const [offeringAssetId, setOfferingAssetId] = useState(null);
  const [quota, setQuota] = useState({ limit: 0, used: 0 });
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const sf = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const anyActive = filters.search || filters.assetType !== "All Types" || filters.channel !== "Any Channel" || filters.format !== "Any Format" || filters.plan !== "All Plans" || filters.credits !== "Any Credits";
  const clearFilters = () => setFilters({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" });

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const profile = await getMyProfile(supabase, userId);
      const myAssets = await listMyAssets(supabase, userId);
      if (cancelled) return;
      const active = myAssets.filter(a => a.status === "active");
      setMyActiveAssets(active);
      setOfferingAssetId(active[0]?.id ?? null);
      const q = await getBrowseQuota(supabase, profile.plan_code, userId);
      if (cancelled) return;
      setQuota(q);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!offeringAssetId) {
      setCandidates([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    setLoading(true);
    setLoadError("");

    (async () => {
      try {
        const rows = await getEligibleCandidates(supabase, offeringAssetId);
        const assetIds = rows.map(r => r.candidate_asset_id);
        const userIds = [...new Set(rows.map(r => r.candidate_user_id))];
        const [{ channelsByAsset, formatsByAsset }, { data: profiles, error: profilesError }] = await Promise.all([
          getChannelsAndFormatsForAssets(supabase, assetIds),
          supabase.from("user_profiles").select("user_id, bio, location_text, created_at, feedback_rating_avg, feedback_rating_count").in("user_id", userIds),
        ]);
        if (profilesError) throw profilesError;
        if (cancelled) return;
        const profileById = Object.fromEntries(profiles.map(p => [p.user_id, p]));
        setCandidates(rows.map(r => ({
          ...r,
          channels: channelsByAsset[r.candidate_asset_id] || [],
          formats: (formatsByAsset[r.candidate_asset_id] || []).map(f => FEEDBACK_FORMAT_DB_TO_SHORT_LABEL[f] || f),
          typeLabel: ASSET_TYPE_DB_TO_LABEL[r.candidate_asset_type] || r.candidate_asset_type,
          profile: profileById[r.candidate_user_id],
        })));
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load candidates.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [offeringAssetId]);

  const shown = candidates.filter(c => {
    if (filters.search && !c.candidate_display_name?.toLowerCase().includes(filters.search.toLowerCase()) && !c.candidate_asset_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.assetType !== "All Types" && c.typeLabel !== filters.assetType) return false;
    if (filters.channel !== "Any Channel" && !c.channels.includes(filters.channel)) return false;
    if (filters.format !== "Any Format" && !c.formats.includes(filters.format)) return false;
    if (filters.plan === "Paid Only" && c.candidate_plan_code === "sprout") return false;
    if (filters.plan === "Free Only" && c.candidate_plan_code !== "sprout") return false;
    if (filters.credits === "Has Credits Now" && c.would_queue) return false;
    return true;
  });

  const selStyle = active => ({ padding: "8px 12px", borderRadius: 10, border: "none", background: active ? T.orange : "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", outline: "none", fontWeight: 600 });

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "20px 16px 0" : "32px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "center" : "flex-end", marginBottom: isMobile ? 16 : 24, gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 22 : 30, fontWeight: 900, color: "#fff", margin: 0 }}>Browse & Request Matches</h1>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: isMobile ? 11 : 13, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", marginBottom: 2 }}>Browse credits left</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#fff" }}>{Math.max(quota.limit - quota.used, 0)}<span style={{ fontSize: 13, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", fontWeight: 400 }}> / {quota.limit}</span></div>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "16px 16px 0 0", padding: "18px 22px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>Offering</div>
              <select value={offeringAssetId || ""} onChange={e => setOfferingAssetId(e.target.value)} style={selStyle(true)}>
                {myActiveAssets.length === 0 && <option value="">No active assets</option>}
                {myActiveAssets.map(a => <option key={a.id} value={a.id} style={{ background: T.brown, color: "#fff" }}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>Search</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.45 }}>🔍</span>
                <input value={filters.search} onChange={e => sf("search", e.target.value)} placeholder="Name or asset..." style={{ padding: "8px 10px 8px 30px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", width: 155, boxSizing: "border-box" }} />
              </div>
            </div>
            {[["Asset Type", "assetType", ASSET_TYPES], ["Channel", "channel", CHANNELS], ["Feedback Format", "format", FB_FORMATS], ["Plan", "plan", PLAN_OPTS], ["Credits", "credits", CREDIT_OPTS]].map(([label, key, opts]) => (
              <div key={key}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
                <select value={filters[key]} onChange={e => sf(key, e.target.value)} style={selStyle(filters[key] !== opts[0])}>
                  {opts.map(o => <option key={o} value={o} style={{ background: T.brown, color: "#fff" }}>{o}</option>)}
                </select>
              </div>
            ))}
            {anyActive && <button onClick={clearFilters} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "rgba(255,80,40,0.28)", color: "#FFB89A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", alignSelf: "flex-end" }}>✕ Clear</button>}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "16px 16px" : "24px 32px" }}>
        {myActiveAssets.length === 0 && !loading && (
          <div style={{ padding: "16px 20px", background: T.orangeP, borderRadius: 14, marginBottom: 18, fontSize: 14, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>
            You need at least one active asset before you can browse for matches. <a href="/assets/new" style={{ color: T.orange, fontWeight: 700 }}>Add an asset →</a>
          </div>
        )}
        {loadError && <div style={{ padding: "16px 20px", background: "#FFE5E5", borderRadius: 14, marginBottom: 18, fontSize: 14, color: "#C0392B", fontFamily: "'DM Sans',sans-serif" }}>⚠️ {loadError}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{loading ? "Loading…" : `${shown.length} candidate${shown.length !== 1 ? "s" : ""} shown`}</span>
          {!isMobile && (
            <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
              {[[T.green, "Available now"], [T.gold, "Near their monthly limit"], [T.brownL, "Previously matched"], [T.red, "Match in progress"]].map(([c, l]) => (
                <div key={l} style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} /><span style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l}</span></div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: isMobile ? 14 : 18 }}>
          {shown.map(c => {
            const hasPrev = c.prior_match_count > 0;
            const blocked = c.has_active_match;
            const rematchable = hasPrev && !blocked;
            const dimmed = blocked;
            const barColor = blocked ? T.red : hasPrev ? "#C8BFB5" : c.would_queue ? T.gold : T.green;
            const rating = c.profile?.feedback_rating_avg || 0;
            const exchanges = c.profile?.feedback_rating_count || 0;
            const memberSince = c.profile?.created_at ? new Date(c.profile.created_at).toLocaleString("default", { month: "short", year: "numeric" }) : "—";
            return (
              <Card key={`${c.candidate_user_id}-${c.candidate_asset_id}`} dim={dimmed} sx={{ padding: 0, overflow: "hidden", border: `2px solid ${dimmed ? "#E8E0D8" : barColor + "55"}` }}>
                <div style={{ height: 4, background: barColor }} />
                <div style={{ padding: "20px 22px", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
                    <Av txt={initials(c.candidate_display_name)} color={dimmed ? "#B0A0A0" : colorForUser(c.candidate_user_id)} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: dimmed ? T.brownL : T.brown, flex: 1, minWidth: 0 }}>{c.candidate_display_name}</span>
                        <PlanPill plan={c.candidate_plan_code === "sprout" ? "free" : "paid"} planName={c.candidate_plan_code} />
                      </div>
                      <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>📍 {c.profile?.location_text || "—"} · Member since {memberSince}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                        <span style={{ fontSize: 13 }}>⭐</span>
                        <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{rating.toFixed(1)} · {exchanges} rated exchanges</span>
                      </div>
                    </div>
                  </div>
                  {c.profile?.bio && <p style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, marginBottom: 14, fontStyle: "italic" }}>&ldquo;{c.profile.bio}&rdquo;</p>}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Asset Available for Review</div>
                    <div style={{ padding: "10px 12px", background: dimmed ? "#F0EAE3" : T.cream, borderRadius: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: dimmed ? T.brownL : T.brown, fontFamily: "'DM Sans',sans-serif", flex: 1 }}>{c.candidate_asset_name}</span>
                        <Pill color={c.candidate_asset_type === "advisory_skills" ? T.purple : T.teal} bg={c.candidate_asset_type === "advisory_skills" ? T.purpleP : T.tealP} sx={{ fontSize: 9 }}>{c.typeLabel}</Pill>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {c.channels.map(ch => <span key={ch} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: "#fff", color: T.brownM, border: "1px solid #DDD4C8" }}>{ch}</span>)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                    {c.formats.map(f => <Pill key={f} color={T.brownL} bg={T.cream} sx={{ fontSize: 9 }}>{f}</Pill>)}
                  </div>
                  {blocked && <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: "#F0EAE3", border: "1px solid #DDD4C8", fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>🔁 A match with this member is already in progress.</div>}
                  {rematchable && <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: T.orangeP, border: `1px solid ${T.orange}44`, fontSize: 12, color: T.brownM, fontFamily: "'DM Sans',sans-serif" }}>🔁 Previously matched · re-match eligible on channels you haven&rsquo;t used yet.</div>}
                  {!blocked && !hasPrev && c.would_queue && <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: T.goldL + "33", border: `1px solid ${T.gold}55`, fontSize: 12, color: T.brownM, fontFamily: "'DM Sans',sans-serif" }}>⏳ This member is near their monthly match limit — your request may be declined.</div>}
                  <Btn sz="sm" v={blocked ? "ghost" : "primary"} disabled={blocked} sx={{ width: "100%", justifyContent: "center" }} onClick={() => setMatchModal(c)}>
                    {blocked ? "Match In Progress" : rematchable ? "⚡ Request Re-Match →" : "Request Match →"}
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
        {!loading && shown.length === 0 && candidates.length > 0 && (
          <div style={{ textAlign: "center", padding: "60px 32px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, marginBottom: 8 }}>No members match your filters</div>
            <Btn v="ghost" sx={{ marginTop: 16 }} onClick={clearFilters}>Clear All Filters</Btn>
          </div>
        )}
      </div>

      {matchModal && (() => {
        const offeringAsset = myActiveAssets.find(a => a.id === offeringAssetId);
        return (
          <RequestMatchModal
            candidate={matchModal}
            userId={userId}
            myAssetId={offeringAssetId}
            myAssetName={offeringAsset?.name}
            myAssetChannels={(offeringAsset?.asset_channels || []).map(c => c.channel_name)}
            onClose={() => setMatchModal(null)}
          />
        );
      })()}
    </div>
  );
}

function RequestMatchModal({ candidate, userId, myAssetId, myAssetName, myAssetChannels, onClose }) {
  const isMobile = useIsMobile();
  const isRematch = candidate.prior_match_count > 0;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  // For a re-match, look up the prior match(es) and the channels already used,
  // intersected with the current assets' channels so create_match won't reject.
  const [prep, setPrep] = useState({ loading: isRematch, previousMatchId: null, myBlockedChannels: [], theirBlockedChannels: [] });

  useEffect(() => {
    if (!isRematch) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      try {
        const { previousMatchId, priorMatchIds } = await getPreviousMatches(supabase, userId, candidate.candidate_user_id);
        const { mine, theirs } = await getUsedChannelsForMatches(supabase, priorMatchIds, userId);
        if (cancelled) return;
        const myBlockedChannels = mine.filter(ch => (myAssetChannels || []).includes(ch));
        const theirBlockedChannels = theirs.filter(ch => (candidate.channels || []).includes(ch));
        setPrep({ loading: false, previousMatchId, myBlockedChannels, theirBlockedChannels });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load your prior match with this member.");
          setPrep(p => ({ ...p, loading: false }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isRematch, userId, candidate.candidate_user_id, candidate.channels, myAssetChannels]);

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const supabase = createClient();
      await requestMatch(supabase, {
        otherUserId: candidate.candidate_user_id,
        myAssetId,
        theirAssetId: candidate.candidate_asset_id,
        previousMatchId: isRematch ? prep.previousMatchId : null,
        myBlockedChannels: isRematch ? prep.myBlockedChannels : [],
        theirBlockedChannels: isRematch ? prep.theirBlockedChannels : [],
      });
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send this match request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: isMobile ? "24px 18px" : "32px 36px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!sent ? (
          <>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, marginBottom: 6 }}>{isRematch ? "Re-Match" : "Request Match"} with {candidate.candidate_display_name}</h2>
            <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 20 }}>{isRematch ? "You’ve matched before — this round covers channels you haven’t used yet." : "You’ll each review one another’s asset."}</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `2px solid ${T.orange}`, background: T.orangeP }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.brownL, textTransform: "uppercase", marginBottom: 4 }}>You&rsquo;re offering</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{myAssetName}</div>
              </div>
              <div style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `2px solid ${T.teal}`, background: T.tealP }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.brownL, textTransform: "uppercase", marginBottom: 4 }}>You&rsquo;ll review</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{candidate.candidate_asset_name}</div>
              </div>
            </div>
            {isRematch && (
              <div style={{ padding: "14px 16px", background: T.cream, borderRadius: 14, marginBottom: 20 }}>
                {prep.loading ? (
                  <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Checking which channels you&rsquo;ve already used…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Channels on {candidate.candidate_asset_name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(candidate.channels || []).length === 0 && <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>No channels listed.</span>}
                      {(candidate.channels || []).map(ch => {
                        const used = prep.theirBlockedChannels.includes(ch);
                        return (
                          <span key={ch} title={used ? "Already reviewed here in a prior match" : undefined} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: used ? "#F0EAE3" : "#fff", color: used ? T.brownL : T.brownM, border: `1px solid ${used ? "#DDD4C8" : T.teal + "55"}`, textDecoration: used ? "line-through" : "none", opacity: used ? 0.7 : 1 }}>{ch}</span>
                        );
                      })}
                    </div>
                    {prep.theirBlockedChannels.length + prep.myBlockedChannels.length > 0 && (
                      <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 10 }}>Struck-through channels were used in a prior match and are blocked this round.</div>
                    )}
                  </>
                )}
              </div>
            )}
            {error && <div style={{ padding: "12px 16px", background: "#FFE5E5", borderRadius: 12, fontSize: 13, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>⚠️ {error}</div>}
            <Btn onClick={send} disabled={sending || prep.loading} sx={{ width: "100%", justifyContent: "center" }}>{sending ? "Sending…" : isRematch ? "⚡ Send Re-Match Request →" : "Send Match Request →"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 52, marginBottom: 16 }}>🤝</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Match Request Sent!</h2><p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>We&rsquo;ve notified <strong>{candidate.candidate_display_name}</strong>. Once feedback is exchanged, you&rsquo;ll both see it on your Dashboard.</p><Btn onClick={onClose}>Done</Btn></div>
        )}
      </div>
    </div>
  );
}
