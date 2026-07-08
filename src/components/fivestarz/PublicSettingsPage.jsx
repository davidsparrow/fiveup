"use client";

import { useState } from "react";
import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { createClient } from "@/lib/supabase/client";
import { Card, Pill } from "@/components/fivestarz/ui";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

// show_* / searchable toggles. `feature` (when set) is the plan_feature_gates
// key that must be enabled for the control to have a public effect.
const TOGGLES = [
  { key: "show_logo", param: "p_show_logo", label: "Show logo / avatar" },
  { key: "show_location", param: "p_show_location", label: "Show location" },
  { key: "show_stats", param: "p_show_stats", label: "Show stats & ratings" },
  { key: "show_feedback_excerpts", param: "p_show_feedback_excerpts", label: "Show approved feedback excerpts", feature: "public_feedback_excerpts_enabled" },
  { key: "show_public_videos", param: "p_show_public_videos", label: "Show public video clips", feature: "public_video_enabled" },
  { key: "show_marketplace_offers", param: "p_show_marketplace_offers", label: "Show Proof Lab offers", feature: "proof_lab_listings_enabled" },
  { key: "searchable_public_profile", param: "p_searchable_public_profile", label: "Allow search-engine indexing", feature: "public_profile_indexing_enabled" },
];

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

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private (only me)" },
  { value: "member_only", label: "Members only" },
  { value: "public", label: "Public" },
];

const MAX_LINKS = 5;

export default function PublicSettingsPage({ initialProfile = {}, features = {}, initialAssets = [], initialFeedback = [], initialLinks = [] }) {
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState(initialProfile);
  const [assets, setAssets] = useState(initialAssets);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [links, setLinks] = useState(initialLinks);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [handle, setHandle] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hasHandle = Boolean(profile.public_username);
  const isPublic = Boolean(profile.profile_public_enabled);

  async function saveField(param, value, key) {
    setError("");
    setNotice("");
    const prev = profile[key];
    setProfile((p) => ({ ...p, [key]: value })); // optimistic
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("update_publishing_settings", { [param]: value });
      if (rpcErr) throw rpcErr;
      setNotice("Saved.");
    } catch (e) {
      setProfile((p) => ({ ...p, [key]: prev })); // revert
      setError(e.message || "Couldn't save — please try again.");
    }
  }

  async function setAssetVisibility(assetId, value) {
    setError("");
    setNotice("");
    const prev = assets.find((a) => a.id === assetId)?.visibility;
    setAssets((list) => list.map((a) => (a.id === assetId ? { ...a, visibility: value } : a)));
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("set_asset_visibility", { p_asset_id: assetId, p_visibility: value });
      if (rpcErr) throw rpcErr;
      // Publishing assigns a public_slug server-side — pull it so we can link.
      if (value === "public") {
        const { data: row } = await supabase.from("assets").select("public_slug").eq("id", assetId).single();
        if (row?.public_slug) {
          setAssets((list) => list.map((a) => (a.id === assetId ? { ...a, public_slug: row.public_slug } : a)));
        }
      }
      setNotice("Saved.");
    } catch (e) {
      setAssets((list) => list.map((a) => (a.id === assetId ? { ...a, visibility: prev } : a)));
      setError(e.message || "Couldn't update that asset — please try again.");
    }
  }

  async function setApproval(item, value) {
    setError("");
    setNotice("");
    const match = (f) => f.source_type === item.source_type && f.id === item.id;
    setFeedback((list) => list.map((f) => (match(f) ? { ...f, approved: value } : f)));
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("approve_public_feedback", {
        p_source_type: item.source_type,
        p_source_id: item.id,
        p_approved: value,
      });
      if (rpcErr) throw rpcErr;
      setNotice("Saved.");
    } catch (e) {
      setFeedback((list) => list.map((f) => (match(f) ? { ...f, approved: !value } : f)));
      setError(e.message || "Couldn't update that feedback — please try again.");
    }
  }

  async function addLink() {
    const url = linkUrl.trim();
    const label = linkLabel.trim();
    if (!url || links.length >= MAX_LINKS) return;
    setAddingLink(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { data: id, error: rpcErr } = await supabase.rpc("add_external_link", { p_url: url, p_label: label || null });
      if (rpcErr) throw rpcErr;
      const nextOrder = links.reduce((m, l) => Math.max(m, l.sort_order ?? 0), -1) + 1;
      setLinks((list) => [...list, { id, url, label: label || null, sort_order: nextOrder, moderation_status: "ok" }]);
      setLinkUrl("");
      setLinkLabel("");
      setNotice("Link added.");
    } catch (e) {
      setError(e.message || "Couldn't add that link — please try again.");
    } finally {
      setAddingLink(false);
    }
  }

  async function removeLink(id) {
    setError("");
    setNotice("");
    const prev = links;
    setLinks((list) => list.filter((l) => l.id !== id));
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("remove_external_link", { p_id: id });
      if (rpcErr) throw rpcErr;
      setNotice("Link removed.");
    } catch (e) {
      setLinks(prev); // revert
      setError(e.message || "Couldn't remove that link — please try again.");
    }
  }

  async function moveLink(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= links.length) return;
    const prev = links;
    const reordered = [...links];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setLinks(reordered);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("reorder_external_links", { p_ids: reordered.map((l) => l.id) });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setLinks(prev); // revert
      setError(e.message || "Couldn't reorder — please try again.");
    }
  }

  async function claim() {
    const clean = handle.trim();
    if (!clean) return;
    setClaiming(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("claim_public_username", { p_username: clean });
      if (rpcErr) throw rpcErr;
      setProfile((p) => ({ ...p, public_username: clean }));
      setNotice("Handle claimed.");
    } catch (e) {
      setError(e.message || "Couldn't claim that handle — try another.");
    } finally {
      setClaiming(false);
    }
  }

  const sectionPad = isMobile ? "24px 16px" : "32px 32px";

  return (
    <div style={{ background: T.cream, minHeight: "70vh" }}>
      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "40px 20px 32px" : "56px 32px 44px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Pill color={T.gold}>Public profile</Pill>
          <h1 style={{ fontFamily: FONT_SERIF, fontSize: isMobile ? 30 : 40, fontWeight: 900, color: "#fff", margin: "12px 0 8px", letterSpacing: "-0.02em" }}>
            Publishing settings
          </h1>
          <p style={{ fontFamily: FONT_SANS, fontSize: 15, color: "#C4A68A", margin: 0, maxWidth: 520, lineHeight: 1.6 }}>
            Choose what the world sees. Everything is private until you turn it on.
          </p>
        </div>
      </section>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: sectionPad }}>
        {(error || notice) && (
          <div
            style={{
              marginBottom: 18,
              padding: "12px 16px",
              borderRadius: 12,
              fontFamily: FONT_SANS,
              fontSize: 14,
              fontWeight: 600,
              background: error ? "#FDECEC" : T.tealP,
              color: error ? T.red : T.teal,
            }}
          >
            {error || notice}
          </div>
        )}

        {/* ── Handle ── */}
        <Card sx={{ padding: isMobile ? 20 : 28, marginBottom: 18 }} hover={false}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: "0 0 6px" }}>Your handle</h2>
          {hasHandle ? (
            <div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 16, color: T.brown, fontWeight: 700 }}>@{profile.public_username}</div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, marginTop: 4 }}>
                Your handle is permanent.{" "}
                {isPublic ? (
                  <Link href={`/u/${profile.public_username}`} style={{ color: T.orange, fontWeight: 700 }}>
                    View public profile →
                  </Link>
                ) : (
                  <span>Turn on “Publish my profile” below to go live.</span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontFamily: FONT_SANS, fontSize: 14, color: T.slate, margin: "0 0 12px" }}>
                Claim a public handle for your profile at <strong>/u/your-handle</strong>. This can only be set once.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="your-handle"
                  style={{ flex: "1 1 200px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: FONT_SANS, color: T.brown, background: T.cream }}
                />
                <button
                  type="button"
                  onClick={claim}
                  disabled={claiming || !handle.trim()}
                  style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: T.orange, color: "#fff", fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: claiming || !handle.trim() ? "not-allowed" : "pointer", opacity: claiming || !handle.trim() ? 0.5 : 1 }}
                >
                  {claiming ? "Claiming…" : "Claim handle"}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ── Publish + visibility toggles ── */}
        <Card sx={{ padding: isMobile ? 20 : 28 }} hover={false}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>What’s public</h2>
          <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, margin: "0 0 18px" }}>
            {hasHandle ? "Publish your profile, then pick what appears on it." : "Claim a handle first to publish your profile."}
          </p>

          {/* master toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #F0E8E0" }}>
            <div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>Publish my profile</div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>Makes /u/{profile.public_username || "your-handle"} visible to anyone.</div>
            </div>
            <Toggle
              checked={isPublic}
              disabled={!hasHandle}
              onChange={(v) => saveField("p_profile_public_enabled", v, "profile_public_enabled")}
            />
          </div>

          {TOGGLES.map((t) => {
            const gated = Boolean(t.feature);
            const enabledByPlan = !gated || features[t.feature];
            const disabled = !hasHandle || !enabledByPlan;
            return (
              <div key={t.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #F0E8E0" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>{t.label}</span>
                    {gated && !enabledByPlan ? <Pill color={T.gold} bg={`${T.gold}22`}>Paid</Pill> : null}
                  </div>
                  {gated && !enabledByPlan ? (
                    <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>Upgrade your plan to enable this.</div>
                  ) : null}
                </div>
                <Toggle
                  checked={Boolean(profile[t.key])}
                  disabled={disabled}
                  onChange={(v) => saveField(t.param, v, t.key)}
                />
              </div>
            );
          })}
        </Card>

        {/* ── Asset visibility ── */}
        <Card sx={{ padding: isMobile ? 20 : 28, marginTop: 18 }} hover={false}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>Your assets</h2>
          <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, margin: "0 0 18px" }}>
            Choose who can see each asset. Only <strong>Public</strong> assets appear at /a/… and on your public profile.
          </p>

          {assets.length === 0 ? (
            <p style={{ fontFamily: FONT_SANS, fontSize: 14, color: T.slate, margin: 0 }}>You haven’t added any assets yet.</p>
          ) : (
            assets.map((a) => {
              const removed = a.moderation_status !== "ok";
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #F0E8E0", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>{a.name}</span>
                      {removed ? <Pill color={T.red} bg={`${T.red}18`}>Removed</Pill> : null}
                    </div>
                    {a.visibility === "public" && a.public_slug ? (
                      <Link href={`/a/${a.public_slug}`} style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.orange, fontWeight: 700 }}>
                        /a/{a.public_slug} →
                      </Link>
                    ) : null}
                  </div>
                  <select
                    value={a.visibility}
                    onChange={(e) => setAssetVisibility(a.id, e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: FONT_SANS, color: T.brown, background: "#fff", cursor: "pointer" }}
                  >
                    {VISIBILITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} disabled={o.value === "public" && removed}>
                        {o.label}
                        {o.value === "public" && removed ? " (unavailable — removed)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })
          )}
        </Card>

        {/* ── Feedback approval ── */}
        <Card sx={{ padding: isMobile ? 20 : 28, marginTop: 18 }} hover={false}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>Public feedback</h2>
          <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, margin: "0 0 18px" }}>
            Approve which received feedback can appear publicly. Approved items show only when “Show approved feedback excerpts” (or clips) is on.
          </p>

          {feedback.length === 0 ? (
            <p style={{ fontFamily: FONT_SANS, fontSize: 14, color: T.slate, margin: 0 }}>No feedback to review yet.</p>
          ) : (
            feedback.map((f) => (
              <div key={`${f.source_type}:${f.id}`} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: "1px solid #F0E8E0" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Pill color={T.teal}>{f.source_type === "engaged_review" ? "Engaged review" : "Member feedback"}</Pill>
                    {f.media_url ? <Pill color={T.purple} bg={T.purpleP}>Clip</Pill> : null}
                  </div>
                  {f.body ? (
                    <p style={{ fontFamily: FONT_SERIF, fontSize: 15, fontStyle: "italic", color: T.brown, lineHeight: 1.5, margin: 0 }}>
                      “{f.body}”
                    </p>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <Toggle checked={Boolean(f.approved)} onChange={(v) => setApproval(f, v)} />
                  <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, color: f.approved ? T.teal : T.slate }}>
                    {f.approved ? "Public" : "Hidden"}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* ── External links ── */}
        <Card sx={{ padding: isMobile ? 20 : 28, marginTop: 18 }} hover={false}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>External links</h2>
          <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, margin: "0 0 16px" }}>
            Add up to {MAX_LINKS} links (your site, socials). They appear on your public profile when the toggle below is on.
          </p>

          {/* master show toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #F0E8E0" }}>
            <div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>Show links on my public profile</div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>Links open in a new tab with no-follow.</div>
            </div>
            <Toggle
              checked={Boolean(profile.show_external_links)}
              disabled={!hasHandle}
              onChange={(v) => saveField("p_show_external_links", v, "show_external_links")}
            />
          </div>

          {/* existing links */}
          {links.map((l, i) => {
            const removed = l.moderation_status !== "ok";
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #F0E8E0", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 700, color: T.brown, wordBreak: "break-all" }}>{l.label || l.url}</span>
                    {removed ? <Pill color={T.red} bg={`${T.red}18`}>Removed</Pill> : null}
                  </div>
                  {l.label ? <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate, wordBreak: "break-all" }}>{l.url}</div> : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" aria-label="Move up" onClick={() => moveLink(i, -1)} disabled={i === 0}
                    style={{ border: "1.5px solid #E8DDD5", background: "#fff", borderRadius: 8, width: 30, height: 30, cursor: i === 0 ? "not-allowed" : "pointer", color: T.brownM, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button type="button" aria-label="Move down" onClick={() => moveLink(i, 1)} disabled={i === links.length - 1}
                    style={{ border: "1.5px solid #E8DDD5", background: "#fff", borderRadius: 8, width: 30, height: 30, cursor: i === links.length - 1 ? "not-allowed" : "pointer", color: T.brownM, opacity: i === links.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button type="button" onClick={() => removeLink(l.id)}
                    style={{ border: "none", background: `${T.red}14`, color: T.red, borderRadius: 8, padding: "0 12px", height: 30, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Remove</button>
                </div>
              </div>
            );
          })}

          {/* add form */}
          {links.length < MAX_LINKS ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://your-site.com"
                style={{ flex: "1 1 220px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: FONT_SANS, color: T.brown, background: T.cream }}
              />
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Label (optional)"
                style={{ flex: "1 1 140px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: FONT_SANS, color: T.brown, background: T.cream }}
              />
              <button
                type="button"
                onClick={addLink}
                disabled={addingLink || !linkUrl.trim()}
                style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: T.orange, color: "#fff", fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: addingLink || !linkUrl.trim() ? "not-allowed" : "pointer", opacity: addingLink || !linkUrl.trim() ? 0.5 : 1 }}
              >
                {addingLink ? "Adding…" : "Add link"}
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, marginTop: 16 }}>You’ve reached the {MAX_LINKS}-link limit. Remove one to add another.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
