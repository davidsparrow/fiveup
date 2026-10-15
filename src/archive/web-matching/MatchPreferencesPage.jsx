"use client";

import { useState } from "react";
import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { createClient } from "@/lib/supabase/client";
import { Card, Pill } from "@/components/fivestarz/ui";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

const DEGREE_EXPLAINERS = {
  1: "1° — never matched with anyone in the direct network of a prior match. The strictest separation, and the smallest candidate pool.",
  2: "2° — also excludes friends-of-friends from prior matches. A balance of independence and reach.",
  3: "3° — widest candidate pool; only very close network overlap is excluded. Feedback stays independent, matching is fastest.",
};

function Toggle({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 46,
        height: 26,
        borderRadius: 20,
        border: "none",
        flexShrink: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? T.teal : "#D8CCC2",
        opacity: disabled ? 0.5 : 1,
        position: "relative",
        transition: "background 0.18s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export default function MatchPreferencesPage({ initialProfile = {}, gates = {} }) {
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState(initialProfile);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const degreesEnabled = Boolean(gates.degreesEnabled);
  const maxDegree = gates.maxDegree ?? 1;
  const canDisableSemiDup = Boolean(gates.canDisableSemiDup);
  const canToggleWithFree = Boolean(gates.canToggleWithFree);

  // Same optimistic pattern as PublicSettingsPage.saveField: set, RPC, revert
  // on failure.
  async function savePref(param, value, key) {
    setError("");
    setNotice("");
    const prev = profile[key];
    setProfile((p) => ({ ...p, [key]: value }));
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("update_match_preferences", { [param]: value });
      if (rpcErr) throw rpcErr;
      setNotice("Saved.");
    } catch (e) {
      setProfile((p) => ({ ...p, [key]: prev }));
      setError(e.message || "Couldn't save — please try again.");
    }
  }

  const lockedRow = (label, hint) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>{label}</span>
        <Pill color={T.gold} bg={`${T.gold}22`}>Paid</Pill>
      </div>
      <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>{hint}</div>
    </div>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "28px 16px 64px" : "44px 24px 88px" }}>
      <p style={{ fontFamily: FONT_SANS, fontSize: 13, marginBottom: 8 }}>
        <Link href="/account" style={{ color: T.teal, textDecoration: "none" }}>← Account</Link>
      </p>
      <h1 style={{ fontFamily: FONT_SERIF, fontSize: isMobile ? 26 : 34, fontWeight: 800, color: T.brown, marginBottom: 6 }}>
        Matching preferences
      </h1>
      <p style={{ fontFamily: FONT_SANS, fontSize: 15, color: T.slate, lineHeight: 1.6, marginBottom: 24 }}>
        Control how ProofSignals pairs you with other members. These settings apply to auto-matches and browse requests alike.
      </p>

      {error ? (
        <div role="alert" style={{ fontFamily: FONT_SANS, fontSize: 14, color: "#B42318", background: "#FEE4E2", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>{error}</div>
      ) : null}
      {notice ? (
        <div role="status" style={{ fontFamily: FONT_SANS, fontSize: 14, color: "#166534", background: "#DCFCE7", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>{notice}</div>
      ) : null}

      <Card sx={{ padding: isMobile ? 20 : 28, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: 0 }}>Degrees of separation</h2>
          {!degreesEnabled ? <Pill color={T.gold} bg={`${T.gold}22`}>Paid</Pill> : null}
        </div>
        <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, lineHeight: 1.6, marginBottom: 14 }}>
          {degreesEnabled
            ? "How far outside your existing review network new matches must come from. Stricter separation means more independent feedback but fewer candidates."
            : "Free plans use 1° separation. Upgrade to choose 1–3° and trade candidate-pool size against network independence."}
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {[1, 2, 3].map((d) => {
            const selected = profile.degrees_of_separation === d;
            const allowed = degreesEnabled && d <= maxDegree;
            return (
              <button
                key={d}
                type="button"
                disabled={!allowed}
                onClick={() => !selected && savePref("p_degrees_of_separation", d, "degrees_of_separation")}
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "10px 22px",
                  borderRadius: 12,
                  border: `2px solid ${selected ? T.teal : "#E4D9CE"}`,
                  background: selected ? `${T.teal}18` : "#fff",
                  color: selected ? T.teal : allowed ? T.brown : "#B8AA9C",
                  cursor: allowed ? "pointer" : "not-allowed",
                }}
              >
                {d}°
              </button>
            );
          })}
        </div>
        <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, lineHeight: 1.55, margin: 0 }}>
          {DEGREE_EXPLAINERS[profile.degrees_of_separation] ?? DEGREE_EXPLAINERS[1]}
        </p>
      </Card>

      <Card sx={{ padding: isMobile ? 20 : 28 }}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>Semi-duplicate matching</h2>
        <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, lineHeight: 1.6, marginBottom: 8 }}>
          Lets a prior match pair repeat when both sides have unused review channels — previously used channels are automatically blocked for both of you.
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #F0E8E0" }}>
          {canDisableSemiDup ? (
            <div>
              <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>Allow semi-duplicate matches</span>
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>Turn off to never be re-matched with a prior partner.</div>
            </div>
          ) : (
            lockedRow("Allow semi-duplicate matches", "On by default. Upgrade to turn semi-duplicate matching off.")
          )}
          <Toggle
            checked={Boolean(profile.allow_semi_duplicate_matches)}
            disabled={!canDisableSemiDup}
            onChange={(v) => savePref("p_allow_semi_duplicate", v, "allow_semi_duplicate_matches")}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0" }}>
          {canToggleWithFree ? (
            <div>
              <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>Allow semi-duplicates with Free members</span>
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>Opt in to be re-matched with Free-plan members too.</div>
            </div>
          ) : (
            lockedRow("Allow semi-duplicates with Free members", "Upgrade to control re-matching with Free-plan members.")
          )}
          <Toggle
            checked={Boolean(profile.allow_semi_duplicate_with_free)}
            disabled={!canToggleWithFree}
            onChange={(v) => savePref("p_allow_semi_duplicate_with_free", v, "allow_semi_duplicate_with_free")}
          />
        </div>
      </Card>
    </main>
  );
}
