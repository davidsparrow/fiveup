"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Btn, Card, Pill } from "@/components/fivestarz/ui";
import { createClient } from "@/lib/supabase/client";
import { createAsset, uploadAssetScreenshot } from "@/lib/fivestarz/data";

const CHNLS = ["Google Business Profile", "Yelp", "Tripadvisor", "Amazon", "Shopify App Store", "Clutch.co", "Trustpilot", "Apple Podcasts", "Spotify", "Substack", "LinkedIn", "G2", "Capterra", "Gumroad", "Teachable"];
const TYPES = ["Service / Consulting", "Advisory / Consulting Skills", "Physical Product", "Digital Product / SaaS", "Content / Podcast / Video", "E-commerce Store", "Free Session / Consultation", "Client Asset"];
const FBTYPES = ["Star Rating (1–5)", "Written Review", "Structured Categories", "Video / Audio Upload"];

export default function AssetPage() {
  const isMobile = useIsMobile();
  const [step, setStep] = useState(1);
  const [a, setA] = useState({ name: "", url: "", type: "", desc: "", channels: [], fbTypes: [], reqStars: false, reqTwo: false, forClient: false, clientName: "", screenshots: [] });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");

  // Each wizard step should open at the top; the body (not the window) is the
  // scroll container, so reset both.
  useEffect(() => {
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [step]);

  const handleCreateAsset = async () => {
    setSaving(true);
    setSaveError("");
    setUploadWarning("");
    try {
      const supabase = createClient();
      const { id: assetId } = await createAsset(supabase, a);

      // Asset exists now; screenshots are optional, so a failed upload should
      // warn rather than block (retrying create would hit the unique-URL guard).
      const withFiles = a.screenshots.filter(s => s.file);
      const failed = [];
      for (let i = 0; i < withFiles.length; i++) {
        try {
          await uploadAssetScreenshot(supabase, assetId, withFiles[i].file, i);
        } catch {
          failed.push(withFiles[i].name);
        }
      }
      if (failed.length > 0) {
        setUploadWarning(`Your asset was created, but ${failed.length} screenshot${failed.length > 1 ? "s" : ""} couldn't be uploaded (${failed.join(", ")}). You can add them later from the asset page.`);
      }
      setDone(true);
    } catch (err) {
      setSaveError(err.message || "Something went wrong creating this asset.");
    } finally {
      setSaving(false);
    }
  };

  const handleFiles = files => {
    const imgs = Array.from(files).filter(f => f.type.startsWith("image/"));
    imgs.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setA(p => ({ ...p, screenshots: [...p.screenshots, { name: f.name, src: e.target.result, file: f }] }));
      reader.readAsDataURL(f);
    });
  };
  const removeScreenshot = idx => setA(p => ({ ...p, screenshots: p.screenshots.filter((_, i) => i !== idx) }));
  const tog = (k, v) => setA(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));

  if (done) return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.cream, padding: 32 }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>🚀</div>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 900, color: T.brown, margin: "0 0 16px" }}>Asset Live!</h1>
        <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 28 }}><strong>{a.name || "Your asset"}</strong> is set up and ready to collect feedback.</p>
        {uploadWarning && <div style={{ padding: "14px 18px", background: "#FFF6E5", borderRadius: 12, fontSize: 14, color: "#8A6D3B", fontFamily: "'DM Sans',sans-serif", marginBottom: 24, textAlign: "left" }}>⚠️ {uploadWarning}</div>}
        <Btn onClick={() => { setDone(false); setStep(1); setUploadWarning(""); setA({ name: "", url: "", type: "", desc: "", channels: [], fbTypes: [], reqStars: false, reqTwo: false, forClient: false, clientName: "", screenshots: [] }); }}>Add Another Asset</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "24px 16px 20px" : "40px 32px 32px" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C4A68A", marginBottom: 8, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>New Asset Setup</div>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 34, fontWeight: 900, color: "#fff", margin: "0 0 24px" }}>What would you like reviews on?</h1>
          <div style={{ display: "flex" }}>
            {["Asset Info", "Channels", "Feedback Settings", "Confirm"].map((s, i) => (
              <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                {i < 3 && <div style={{ position: "absolute", top: 14, left: "50%", right: "-50%", height: 2, background: step > i + 1 ? T.orange : "rgba(255,255,255,0.2)", zIndex: 0 }} />}
                <div style={{ width: 28, height: 28, borderRadius: "50%", zIndex: 1, background: step > i + 1 ? T.gold : step === i + 1 ? T.orange : "rgba(255,255,255,0.2)", color: step >= i + 1 ? "#fff" : "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{step > i + 1 ? "✓" : i + 1}</div>
                {!isMobile && <div style={{ fontSize: 11, color: step === i + 1 ? "#fff" : "rgba(255,255,255,0.5)", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, textAlign: "center" }}>{s}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 740, margin: "0 auto", padding: isMobile ? "20px 16px 40px" : "40px 32px" }}>
        <Card sx={{ padding: isMobile ? 20 : 36 }}>
          {step === 1 && (

            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 28 }}>About Your Asset</h2>
              {[["name", "Asset Name *", "e.g. RevFlow Consulting, My Podcast, Advisory Skills..."], ["url", "Unique URL *", "yoursite.com/product or booking page URL"]].map(([k, l, p]) => (
                <div key={k} style={{ marginBottom: 20 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>{l}</label><input value={a[k]} onChange={e => setA(prev => ({ ...prev, [k]: e.target.value }))} placeholder={p} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 15, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, outline: "none", boxSizing: "border-box" }} /></div>
              ))}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Asset Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                  {TYPES.map(t => (
                    <div key={t} onClick={() => setA(p => ({ ...p, type: t, forClient: t === "Client Asset" }))} style={{ padding: "12px 16px", borderRadius: 12, cursor: "pointer", border: `2px solid ${a.type === t ? (t.includes("Advisory") ? T.purple : T.orange) : "#E8DDD5"}`, background: a.type === t ? (t.includes("Advisory") ? T.purpleP : T.orangeP) : "#fff", fontSize: 14, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: a.type === t ? (t.includes("Advisory") ? T.purple : T.orange) : T.brown, transition: "all 0.15s" }}>
                      {t.includes("Advisory") && "🧠 "}{t}
                    </div>
                  ))}
                </div>
                {a.type.includes("Advisory") && <div style={{ marginTop: 12, padding: "14px 16px", background: T.purpleP, borderRadius: 12, fontSize: 13, color: T.purple, fontFamily: "'DM Sans',sans-serif" }}><strong>Advisory Skills</strong> — Paid feature. Your expertise is the asset. Peers experience your session and review your skills and value delivered.</div>}
              </div>
              {a.forClient && <div style={{ marginBottom: 20, padding: 16, background: T.tealP, borderRadius: 14 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.teal, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Client&rsquo;s Business Name</label><input value={a.clientName} onChange={e => setA(p => ({ ...p, clientName: e.target.value }))} placeholder="e.g. Dave's Plumbing Co." style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${T.teal}44`, fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: "#fff", outline: "none", boxSizing: "border-box" }} /></div>}
              <div style={{ marginBottom: 28 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Description</label><textarea value={a.desc} onChange={e => setA(p => ({ ...p, desc: e.target.value }))} placeholder="What should reviewers experience? Include a link, what to try, how to book a session..." style={{ width: "100%", minHeight: 90, padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Screenshots <span style={{ fontWeight: 400, color: T.brownL }}>(optional)</span></label>
                <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${dragOver ? T.orange : "#DDD4C8"}`, borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? T.orangeP : T.cream, transition: "all 0.18s" }}>
                  <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 4 }}>Drag &amp; drop screenshots here</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.brownL }}>or click to browse · JPG, PNG, WebP, GIF</div>
                </div>
                {a.screenshots.length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    {a.screenshots.map((s, i) => (
                      <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${T.orangeP}`, flexShrink: 0 }}>
                        <Image src={s.src} alt={s.name} fill unoptimized sizes="80px" style={{ objectFit: "cover" }} />
                        <button onClick={e => { e.stopPropagation(); removeScreenshot(i); }} style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(61,43,31,0.75)", border: "none", cursor: "pointer", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Btn onClick={() => setStep(2)} sx={{ width: "100%", justifyContent: "center" }} disabled={!a.name || !a.url || !a.type}>Continue to Channels →</Btn>
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 8 }}>Review Channels</h2>
              <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 24 }}>Where can reviewers post? The reviewer chooses which channel to use.</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
                {CHNLS.map(ch => <div key={ch} onClick={() => tog("channels", ch)} style={{ padding: "12px 14px", borderRadius: 12, cursor: "pointer", border: `2px solid ${a.channels.includes(ch) ? T.teal : "#E8DDD5"}`, background: a.channels.includes(ch) ? T.tealP : "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: a.channels.includes(ch) ? T.teal : T.brown, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>{a.channels.includes(ch) && <span>✓</span>}{ch}</div>)}
              </div>
              {a.channels.length > 0 && <div style={{ padding: "14px 18px", background: T.greenP, borderRadius: 12, fontSize: 14, color: T.green, fontFamily: "'DM Sans',sans-serif", marginBottom: 20, fontWeight: 600 }}>✓ {a.channels.length} channel{a.channels.length > 1 ? "s" : ""}: {a.channels.join(", ")}</div>}
              <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" onClick={() => setStep(1)}>← Back</Btn><Btn onClick={() => setStep(3)} sx={{ flex: 1, justifyContent: "center" }} disabled={a.channels.length === 0}>Continue to Feedback Settings →</Btn></div>
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 8 }}>Feedback Settings</h2>
              <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 20 }}>Choose allowed formats. Reviewer must use at least one.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {FBTYPES.map(fb => <div key={fb} onClick={() => tog("fbTypes", fb)} style={{ padding: "16px 18px", borderRadius: 14, cursor: "pointer", border: `2px solid ${a.fbTypes.includes(fb) ? T.orange : "#E8DDD5"}`, background: a.fbTypes.includes(fb) ? T.orangeP : "#fff", display: "flex", alignItems: "center", gap: 14, transition: "all 0.15s" }}><div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${a.fbTypes.includes(fb) ? T.orange : "#D0C4BC"}`, background: a.fbTypes.includes(fb) ? T.orange : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{a.fbTypes.includes(fb) && <span style={{ color: "#fff", fontSize: 13 }}>✓</span>}</div><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 15, color: T.brown }}>{fb}</span></div>)}
              </div>
              <div style={{ padding: "20px", background: T.warm, borderRadius: 16, marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><Pill color={T.orange}>Bloom+ Feature</Pill><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>Require Specific Types</span></div>
                {[["reqStars", "Require star rating always", "Reviewers must leave a star rating"], ["reqTwo", "Require stars + one other type", "Stars plus at least one additional format"]].map(([k, lbl, desc]) => (
                  <div key={k} onClick={() => setA(p => ({ ...p, [k]: !p[k] }))} style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", padding: "12px 14px", background: a[k] ? T.orangeP : "#fff", borderRadius: 12, border: `1.5px solid ${a[k] ? T.orange : "#E8DDD5"}`, transition: "all 0.15s", marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${a[k] ? T.orange : "#D0C4BC"}`, background: a[k] ? T.orange : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{a[k] && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}</div>
                    <div><div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, color: T.brown }}>{lbl}</div><div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.brownL }}>{desc}</div></div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" onClick={() => setStep(2)}>← Back</Btn><Btn onClick={() => setStep(4)} sx={{ flex: 1, justifyContent: "center" }}>Review &amp; Confirm →</Btn></div>
            </div>
          )}
          {step === 4 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 24 }}>Confirm Your Asset</h2>
              <div style={{ background: T.cream, borderRadius: 16, padding: 24, marginBottom: 24 }}>
                {[["Asset Name", a.name || "—"], ["URL", a.url || "—"], ["Type", a.type || "—"], ["Client", a.forClient ? (a.clientName || "Client asset") : "—"], ["Channels", a.channels.join(", ") || "None"], ["Feedback Allowed", a.fbTypes.join(", ") || "Any format"], ["Requirements", a.reqTwo ? "Stars + 1 other" : a.reqStars ? "Stars required" : "Reviewer's choice"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #EDE4DA", fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                    <span style={{ color: T.brownL, minWidth: 160, flexShrink: 0 }}>{k}</span><span style={{ color: T.brown, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "14px 18px", background: T.tealP, borderRadius: 12, fontSize: 14, color: T.teal, fontFamily: "'DM Sans',sans-serif", marginBottom: 24 }}>🔍 We&rsquo;ll verify your URL before activating. Usually takes a few minutes.</div>
              {saveError && <div style={{ padding: "14px 18px", background: "#FFE5E5", borderRadius: 12, fontSize: 14, color: "#C0392B", fontFamily: "'DM Sans',sans-serif", marginBottom: 24 }}>⚠️ {saveError}</div>}
              <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" onClick={() => setStep(3)} disabled={saving}>← Back</Btn><Btn v="teal" onClick={handleCreateAsset} disabled={saving} sx={{ flex: 1, justifyContent: "center" }}>{saving ? "Creating…" : "✦ Create Asset & Start Matching"}</Btn></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
