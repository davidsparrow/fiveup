"use client";

import { useState } from "react";

import { PROOF_LISTINGS, PROOF_CATS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { Av, Btn, Pill } from "@/components/fivestarz/ui";

export default function ProofLabPage() {
  const [cat, setCat] = useState("All");
  const [reqModal, setReqModal] = useState(null);
  const shown = cat === "All" ? PROOF_LISTINGS : PROOF_LISTINGS.filter(l => l.category === cat);

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: "40px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 24 }}>
            <Pill color={T.gold}>🧪 Members-Only Deals</Pill>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 900, color: "#fff", margin: "12px 0 8px", letterSpacing: "-0.02em" }}>The Proof Lab</h1>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 16, color: "#C4A68A", margin: 0, maxWidth: 560 }}>Members offer exclusive deals on their best services — marketing, design, video, AI, ads, and more. Lock in founder-only pricing.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 20 }}>
            {PROOF_CATS.map(c => (
              <button key={c} onClick={() => setCat(c)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 12, background: cat === c ? T.gold : "rgba(255,255,255,0.12)", color: cat === c ? T.brown : "#fff", transition: "all 0.15s" }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 60px" }}>
        <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, marginBottom: 20 }}>{shown.length} listing{shown.length !== 1 ? "s" : ""}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {shown.map(l => (
            <div key={l.id}
              style={{ background: "#fff", borderRadius: 20, border: "1.5px solid #F0E8E0", overflow: "hidden", display: "flex", flexDirection: "column", transition: "all 0.22s", boxShadow: "0 2px 10px rgba(61,43,31,0.06)" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 10px 32px rgba(61,43,31,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(61,43,31,0.06)"; }}>
              <div style={{ height: 4, background: l.color }} />
              <div style={{ padding: "20px 20px 18px", display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                  <Av txt={l.avatar} color={l.color} size={34} />
                  <div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, color: T.brown }}>{l.seller}</div>
                    <div style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l.category}</div>
                  </div>
                  {l.badge && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", color: l.color, background: l.color + "18", padding: "3px 9px", borderRadius: 12 }}>{l.badge}</span>}
                </div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown, marginBottom: 8, lineHeight: 1.25 }}>{l.title}</div>
                <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, marginBottom: 16, flex: 1 }}>{l.desc}</div>
                <div style={{ background: T.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans',sans-serif" }}>Retail</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15, color: T.brownL, textDecoration: "line-through" }}>{l.retail}</div>
                    </div>
                    <div style={{ fontSize: 20, color: "#DDD4C8" }}>→</div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans',sans-serif" }}>Members Pay</div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: 22, color: T.orange }}>{l.members}</div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 10, color: T.brownL, fontFamily: "'DM Sans',sans-serif", textAlign: "right", lineHeight: 1.4 }}>{l.unit}</div>
                  </div>
                </div>
                <Btn onClick={() => setReqModal(l)} sx={{ width: "100%", justifyContent: "center" }}>Request This Deal →</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>

      {reqModal && <ProofLabRequestModal listing={reqModal} onClose={() => setReqModal(null)} />}
    </div>
  );
}

function ProofLabRequestModal({ listing, onClose }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [timeframe, setTimeframe] = useState(1);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const TF = ["ASAP", "Soon", "No Rush"];
  const send = async () => {
    if (!email) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/beta-signup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          name: `Proof Lab: ${listing.title}`, email, business: listing.seller, url: listing.category,
          goal: `Timeframe: ${TF[timeframe]}\n\nNote: ${note || "(none)"}`,
        }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch { setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "36px 40px", maxWidth: 460, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!sent ? (
          <>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>Request Deal</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 800, color: T.brown, lineHeight: 1.2, marginBottom: 4 }}>{listing.title}</div>
              <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>by {listing.seller} · <span style={{ color: T.orange, fontWeight: 700 }}>{listing.members}</span> {listing.unit}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Your Best Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Note <span style={{ fontWeight: 400, color: T.brownL }}>(optional)</span></label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the member should know..."
                style={{ width: "100%", minHeight: 72, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Timeframe</label>
              <div style={{ padding: "14px 16px", background: T.cream, borderRadius: 12 }}>
                <input type="range" min={0} max={2} step={1} value={timeframe} onChange={e => setTimeframe(Number(e.target.value))} style={{ width: "100%", accentColor: T.orange, cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  {TF.map((lbl, i) => <span key={lbl} style={{ fontSize: 12, fontWeight: timeframe === i ? 800 : 500, color: timeframe === i ? T.orange : T.brownL, fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s" }}>{lbl}</span>)}
                </div>
              </div>
            </div>
            {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", borderRadius: 10, fontSize: 13, color: T.red, fontFamily: "'DM Sans',sans-serif", marginBottom: 12 }}>{error}</div>}
            <Btn onClick={send} sx={{ width: "100%", justifyContent: "center" }} disabled={!email || loading}>{loading ? "Sending..." : "Send Request →"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Request Sent!</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>
              <strong>{listing.seller}</strong> will reach out to <strong>{email}</strong> with next steps.
            </p>
            <Btn onClick={onClose}>Done</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

