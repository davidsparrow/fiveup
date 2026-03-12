"use client";

import { useEffect, useState } from "react";

import { T } from "@/lib/fivestarz/theme";

import { Btn } from "./ui";

const INITIAL_FORM = { name: "", email: "", business: "", url: "", goal: "" };

export default function BetaModal({ show, onClose }) {
  const [step, setStep] = useState("form");
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) {
      setStep("form");
      setForm(INITIAL_FORM);
      setLoading(false);
      setError("");
    }
  }, [show]);

  if (!show) return null;

  const submit = async () => {
    if (!form.name || !form.email) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("send failed");
      setStep("success");
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "40px 44px", maxWidth: 500, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative", animation: "popIn 0.25s ease" }}>
        <style>{"@keyframes popIn{from{opacity:0;transform:scale(0.93) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}"}</style>
        <button onClick={onClose} style={{ position: "absolute", top: 21, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {step === "form" ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 28 }}><div style={{ fontSize: 36, marginBottom: 8 }}>⭐</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800, color: T.brown, margin: "0 0 8px" }}>Request Beta Access</h2><p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>First 500 members · Free Bloom for 90 days</p></div>
            {[["name", "Your Name *", "Jordan Rivera", "text"], ["email", "Email Address *", "jordan@revflow.co", "email"], ["business", "Business Name", "RevFlow Consulting", "text"], ["url", "Website URL", "revflow.co", "text"], ["goal", "What do you want reviews for?", "My consulting, podcast, Shopify store...", "text"]].map(([k, l, p, t]) => (
              <div key={k} style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>{l}</label><input type={t} placeholder={p} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, outline: "none", boxSizing: "border-box" }} /></div>
            ))}
            {error ? <div style={{ padding: "10px 14px", background: "#FFF0F0", borderRadius: 10, fontSize: 13, color: T.red, fontFamily: "'DM Sans',sans-serif", marginBottom: 12, marginTop: 8 }}>{error}</div> : null}
            <Btn onClick={submit} sx={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={loading}>{loading ? "Sending..." : "✦ Request My Spot →"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>You&rsquo;re on the list!</h2><p style={{ fontSize: 15, color: T.slate, lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif", marginBottom: 28 }}>Thanks, <strong>{form.name || "friend"}</strong>! Confirmation sent to <strong>{form.email || "your inbox"}</strong>.</p><Btn onClick={onClose}>Back to FiveStarz</Btn></div>
        )}
      </div>
    </div>
  );
}
