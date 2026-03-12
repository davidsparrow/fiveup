"use client";

import { useState } from "react";
import { ME, MEMBERS, ASSET_TYPES, CHANNELS, FB_FORMATS, PLAN_OPTS, CREDIT_OPTS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { Av, Stars, Btn, Card, Pill, PlanPill } from "@/components/fivestarz/ui";

export default function BrowsePage() {
  const [filters, setFilters] = useState({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" });
  const [outModal, setOutModal] = useState(null);
  const [savedModal, setSavedModal] = useState(null);
  const [matchModal, setMatchModal] = useState(null);
  const sf = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const anyActive = filters.search || filters.assetType !== "All Types" || filters.channel !== "Any Channel" || filters.format !== "Any Format" || filters.plan !== "All Plans" || filters.credits !== "Any Credits";

  const shown = MEMBERS.filter(m => {
    if (filters.search && !m.name.toLowerCase().includes(filters.search.toLowerCase()) && !m.assets.some(a => a.name.toLowerCase().includes(filters.search.toLowerCase()))) return false;
    if (filters.assetType !== "All Types" && !m.assets.some(a => a.type === filters.assetType)) return false;
    if (filters.channel !== "Any Channel" && !m.assets.some(a => a.channels.includes(filters.channel))) return false;
    if (filters.format !== "Any Format" && !m.formats.includes(filters.format)) return false;
    if (filters.plan === "Paid Only" && m.plan !== "paid") return false;
    if (filters.plan === "Free Only" && m.plan !== "free") return false;
    if (filters.credits === "Has Credits Now" && m.credits === 0) return false;
    return true;
  });

  const onRequest = m => { if (m.credits === 0) { setOutModal(m); return; } setMatchModal(m); };
  const selStyle = active => ({ padding: "8px 12px", borderRadius: 10, border: "none", background: active ? T.orange : "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", outline: "none", fontWeight: 600 });
  const clearFilters = () => setFilters({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" });

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: "32px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#C4A68A", marginBottom: 6, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid Members Only</div>
              <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 30, fontWeight: 900, color: "#fff", margin: 0 }}>Browse & Request Matches</h1>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Browse credits left</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800, color: "#fff" }}>{ME.browseTotal - ME.browseUsed}<span style={{ fontSize: 16, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", fontWeight: 400 }}> / {ME.browseTotal}</span></div>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "16px 16px 0 0", padding: "18px 22px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>Search</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.45 }}>🔍</span>
                <input value={filters.search} onChange={e => sf("search", e.target.value)} placeholder="Name or asset..." style={{ padding: "8px 10px 8px 30px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", width: 155, boxSizing: "border-box" }} />
              </div>
            </div>
            {[["Asset Type", "assetType", ASSET_TYPES], ["Review Channel", "channel", CHANNELS], ["Feedback Format", "format", FB_FORMATS], ["Plan", "plan", PLAN_OPTS], ["Credits", "credits", CREDIT_OPTS]].map(([label, key, opts]) => (
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

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 22, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{shown.length} member{shown.length !== 1 ? "s" : ""} shown</span>
          <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
            {[[T.green, "Has credits, new match"], [T.gold, "⚡ Re-match eligible (diff channels)"], [T.brownL, "Previously matched"], [T.red, "Out of credits"]].map(([c, l]) => (
              <div key={l} style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} /><span style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l}</span></div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18 }}>
          {shown.map(m => {
            const noCredits = m.credits === 0;
            const hasPrev = !!m.prev;
            const semiOk = m.prev?.semiOk;
            const dimmed = hasPrev && !semiOk;
            const barColor = noCredits ? T.red : semiOk ? T.gold : hasPrev ? "#C8BFB5" : T.green;
            return (
              <Card key={m.id} dim={dimmed} sx={{ padding: 0, overflow: "hidden", border: `2px solid ${dimmed ? "#E8E0D8" : barColor + "55"}` }}>
                <div style={{ height: 4, background: barColor }} />
                <div style={{ padding: "20px 22px", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
                    <Av txt={m.avatar} color={dimmed ? "#B0A0A0" : m.color} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: dimmed ? T.brownL : T.brown }}>{m.name}</span>
                        <PlanPill plan={m.plan} planName={m.planName} />
                        {noCredits && <Pill color={T.red} bg={T.red + "18"} sx={{ fontSize: 10 }}>No Credits</Pill>}
                        {semiOk && <Pill color={T.gold} bg={T.gold + "28"} sx={{ fontSize: 10 }}>⚡ Re-match OK</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>📍 {m.loc} · Member since {m.since}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                        <Stars n={Math.round(m.rating)} size={12} />
                        <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{m.rating} feedback quality · {m.exchanges} exchanges</span>
                        <span style={{ fontSize: 10, fontWeight: 700, background: T.gold + "22", color: T.gold, padding: "1px 8px", borderRadius: 10, fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.04em" }}>⭐ INTERNAL RATING</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, marginBottom: 14, fontStyle: "italic" }}>&ldquo;{m.bio}&rdquo;</p>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Assets Available for Review</div>
                    {m.assets.map((a, i) => (
                      <div key={i} style={{ padding: "10px 12px", background: dimmed ? "#F0EAE3" : T.cream, borderRadius: 10, marginBottom: 7 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: dimmed ? T.brownL : T.brown, fontFamily: "'DM Sans',sans-serif", flex: 1 }}>{a.name}</span>
                          <Pill color={a.type.includes("Advisory") ? T.purple : T.teal} bg={a.type.includes("Advisory") ? T.purpleP : T.tealP} sx={{ fontSize: 9 }}>{a.type.replace(" / Consulting", "").replace("Digital Product / ", "")}</Pill>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {a.channels.map(ch => { const blocked = semiOk && m.prev?.blocked?.includes(ch); return <span key={ch} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: blocked ? "#FFE5E5" : "#fff", color: blocked ? T.red : T.brownM, border: `1px solid ${blocked ? T.red + "44" : "#DDD4C8"}`, textDecoration: blocked ? "line-through" : "none" }}>{blocked ? "🚫 " : ""}{ch}</span>; })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                    {m.formats.map(f => <Pill key={f} color={T.brownL} bg={T.cream} sx={{ fontSize: 9 }}>{f}</Pill>)}
                  </div>
                  {hasPrev && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: semiOk ? T.goldL + "33" : "#F0EAE3", border: `1px solid ${semiOk ? T.gold + "55" : "#DDD4C8"}` }}>
                      {semiOk ? <div style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}><span style={{ color: T.gold, fontWeight: 700 }}>⚡ Re-match eligible</span><span style={{ color: T.brownL }}> · Prev matched {m.prev.date} on {m.prev.channel}</span><div style={{ color: T.brownM, marginTop: 4, fontWeight: 600, fontSize: 11 }}>Strikethrough channels are blocked this round — both sides must use different channels.</div></div>
                        : <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>🔁 Previously matched · {m.prev.date}{m.prev.channel ? ` · Posted to ${m.prev.channel}` : " · No review posted"}</div>}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}><span style={{ color: noCredits ? T.red : T.green, fontWeight: 700 }}>{noCredits ? "0 credits" : `${m.credits} credits`}</span><span style={{ color: T.brownL }}> left this month</span></span>
                    <div style={{ display: "flex", gap: 3 }}>{Array.from({ length: Math.min(m.creditsTotal, 12) }).map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i < m.credits ? T.green : "#E0D5CC" }} />)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn sz="sm" v="ghost">View Profile</Btn>
                    <Btn sz="sm" v={noCredits ? "ghost" : semiOk ? "gold" : "primary"} sx={{ flex: 1, justifyContent: "center" }} onClick={() => onRequest(m)}>
                      {noCredits ? "💾 Save for Next Month" : semiOk ? "⚡ Request Re-Match" : "Request Match →"}
                    </Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {shown.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 32px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, marginBottom: 8 }}>No members match your filters</div>
            <Btn v="ghost" sx={{ marginTop: 16 }} onClick={clearFilters}>Clear All Filters</Btn>
          </div>
        )}
      </div>

      {outModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "36px 40px", maxWidth: 420, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📅</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>This member is out of credits this month.</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 28 }}><strong>{outModal.name}</strong> has used all their matches for {new Date().toLocaleString("default", { month: "long" })}. Save this match to kick off automatically next month?</p>
            <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" sx={{ flex: 1, justifyContent: "center" }} onClick={() => setOutModal(null)}>Cancel</Btn><Btn v="teal" sx={{ flex: 1, justifyContent: "center" }} onClick={() => { setSavedModal(outModal); setOutModal(null); }}>📌 Save</Btn></div>
          </div>
        </div>
      )}

      {savedModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "36px 40px", maxWidth: 380, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Match Saved!</h2>
            <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>We&rsquo;ll kick off your match with <strong>{savedModal.name}</strong> on the 1st of next month. No credits deducted from either of you this month.</p>
            <Btn onClick={() => setSavedModal(null)} sx={{ width: "100%", justifyContent: "center" }}>Got It</Btn>
          </div>
        </div>
      )}

      {matchModal && <RequestMatchModal member={matchModal} onClose={() => setMatchModal(null)} />}
    </div>
  );
}

function RequestMatchModal({ member, onClose }) {
  const [myAsset, setMyAsset] = useState(null);
  const [theirAsset, setTheirAsset] = useState(null);
  const [sent, setSent] = useState(false);
  const semi = member.prev?.semiOk;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "32px 36px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!sent ? (
          <>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, marginBottom: 6 }}>Request Match with {member.name}</h2>
            <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 20 }}>Choose which assets you&rsquo;ll each review in this exchange.</p>
            {semi && <div style={{ padding: "12px 16px", background: T.goldL + "44", borderRadius: 12, border: `1.5px solid ${T.gold}55`, marginBottom: 18, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: T.brownM }}>⚡ <strong>Semi-duplicate match.</strong> You must use different review channels this round. Blocked channels are struck through below.</div>}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Which of YOUR assets to review?</div>
              {ME.assets.map(a => (
                <div key={a.id} onClick={() => setMyAsset(a.id)} style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 8, border: `2px solid ${myAsset === a.id ? T.orange : "#E8DDD5"}`, background: myAsset === a.id ? T.orangeP : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 18 }}>{a.img}</span><div><div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{a.name}</div><div style={{ fontSize: 11, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>{a.type}</div></div></div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Which of {member.name.split(" ")[0]}&rsquo;s assets to review?</div>
              {member.assets.map((a, i) => (
                <div key={i} onClick={() => setTheirAsset(i)} style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 8, border: `2px solid ${theirAsset === i ? T.teal : "#E8DDD5"}`, background: theirAsset === i ? T.tealP : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 6 }}>{a.name}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {a.channels.map(ch => { const bl = semi && member.prev?.blocked?.includes(ch); return <span key={ch} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: bl ? "#FFE5E5" : T.cream, color: bl ? T.red : T.brownM, fontFamily: "'DM Sans',sans-serif", textDecoration: bl ? "line-through" : "none" }}>{bl ? "🚫 " : ""}{ch}</span>; })}
                  </div>
                </div>
              ))}
            </div>
            <Btn onClick={() => myAsset !== null && theirAsset !== null && setSent(true)} sx={{ width: "100%", justifyContent: "center" }} disabled={myAsset === null || theirAsset === null}>Send Match Request →</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 52, marginBottom: 16 }}>🤝</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Match Request Sent!</h2><p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>We&rsquo;ve notified <strong>{member.name}</strong>. Once they accept, you&rsquo;ll both get instructions to experience each other&rsquo;s work. 1 browse credit used.</p><Btn onClick={onClose}>Done</Btn></div>
        )}
      </div>
    </div>
  );
}


