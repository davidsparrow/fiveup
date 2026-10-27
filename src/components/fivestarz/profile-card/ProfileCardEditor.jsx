"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { Card, Pill, Stars } from "@/components/fivestarz/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ACCEPT_ATTR, clearAvatar, uploadAvatar } from "@/lib/fivestarz/avatar-upload";
import { T } from "@/lib/fivestarz/theme";
import { createClient } from "@/lib/supabase/client";

import {
  BG_KINDS, BG_PRESETS, BG_PRESET_KEYS, FRAME_SHAPES, PALETTE, PALETTE_KEYS, PHOTO_BGS, PHOTO_POSITIONS,
  RING_STYLES, RING_WIDTHS, SHADOWS, TEXT_ALIGNS, TEXT_SIDES, isValidStyle, normalizeStyle,
} from "./cardStyle";
import ProfileCard from "./ProfileCard";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";
const TAGLINE_MAX = 80;

const LABELS = {
  circle: "Circle", rounded: "Rounded", squircle: "Squircle", arch: "Arch", none: "No frame",
  solid: "Solid", gradient: "Gradient",
  thin: "Thin", regular: "Regular", bold: "Bold",
  transparent: "See-through", white: "White",
  soft: "Soft", strong: "Strong",
  auto: "Auto", top: "Top", bottom: "Bottom", left: "Left", center: "Center", right: "Right",
  preset: "Preset",
};
const label = (v) => LABELS[v] ?? v.charAt(0).toUpperCase() + v.slice(1);

const headlineKey = (type, id) => (type && id ? `${type}:${id}` : null);

/* ── small controls ─────────────────────────────────────────────────────── */

function Field({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.brownL, marginBottom: 8 }}>
        {title}
      </div>
      {children}
      {hint ? <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

function Chips({ options, value, onChange, name }) {
  return (
    <div role="radiogroup" aria-label={name} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              border: `1.5px solid ${on ? T.orange : "#E8DDD5"}`,
              background: on ? T.orangeP : "#fff",
              color: on ? T.orange : T.brown,
              fontFamily: FONT_SANS,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

function Swatches({ value, onChange, name, keys = PALETTE_KEYS }) {
  return (
    <div role="radiogroup" aria-label={name} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {keys.map((k) => {
        const on = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={k}
            title={k}
            onClick={() => onChange(k)}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: PALETTE[k],
              border: `3px solid ${on ? T.orange : "#fff"}`,
              boxShadow: on ? `0 0 0 2px ${T.orange}` : "0 0 0 1px #E8DDD5",
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}

function Presets({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Background preset" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {BG_PRESET_KEYS.map((k) => {
        const on = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(k)}
            style={{
              width: 64,
              height: 44,
              borderRadius: 10,
              background: BG_PRESETS[k].css,
              border: `3px solid ${on ? T.orange : "#fff"}`,
              boxShadow: on ? `0 0 0 2px ${T.orange}` : "0 0 0 1px #E8DDD5",
              cursor: "pointer",
              color: BG_PRESETS[k].onDark ? "#fff" : T.brown,
              fontFamily: FONT_SANS,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {BG_PRESETS[k].label}
          </button>
        );
      })}
    </div>
  );
}

function PositionGrid({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Photo position" style={{ display: "grid", gridTemplateColumns: "repeat(3, 44px)", gap: 6 }}>
      {PHOTO_POSITIONS.map((p) => {
        const on = p === value;
        const [v, h] = p.split("-");
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={p.replace("-", " ")}
            onClick={() => onChange(p)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: `1.5px solid ${on ? T.orange : "#E8DDD5"}`,
              background: on ? T.orangeP : "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: v === "top" ? "flex-start" : "flex-end",
              justifyContent: h === "left" ? "flex-start" : h === "right" ? "flex-end" : "center",
              padding: 6,
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: on ? T.orange : T.brownL }} />
          </button>
        );
      })}
    </div>
  );
}

const input = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #E8DDD5",
  fontSize: 14,
  fontFamily: FONT_SANS,
  color: T.brown,
  background: T.cream,
};

/* ── the editor ─────────────────────────────────────────────────────────── */

export default function ProfileCardEditor({ userId, initialProfile = {}, approvedReviews = [], links = [] }) {
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState("edit");

  const [style, setStyle] = useState(() => normalizeStyle(initialProfile.profile_style));
  const [tagline, setTagline] = useState(initialProfile.tagline ?? "");
  const [headline, setHeadline] = useState(headlineKey(initialProfile.headline_feedback_source_type, initialProfile.headline_feedback_source_id));
  const [saved, setSaved] = useState(() => ({
    style: normalizeStyle(initialProfile.profile_style),
    tagline: initialProfile.tagline ?? "",
    headline: headlineKey(initialProfile.headline_feedback_source_type, initialProfile.headline_feedback_source_id),
  }));

  const [words, setWords] = useState({
    display_name: initialProfile.display_name ?? "",
    bio: initialProfile.bio ?? "",
    location_text: initialProfile.location_text ?? "",
  });
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);

  const dirty =
    JSON.stringify(style) !== JSON.stringify(saved.style) || tagline.trim() !== saved.tagline || headline !== saved.headline;

  const pickedReview = useMemo(
    () => approvedReviews.find((r) => headlineKey(r.source_type, r.id) === headline) ?? null,
    [approvedReviews, headline],
  );

  // The preview is composed client-side from form state so it is instant.
  const preview = useMemo(
    () => ({
      display_name: words.display_name || "Your name",
      public_username: initialProfile.public_username ?? "your-handle",
      bio: words.bio,
      location_text: initialProfile.show_location ? words.location_text : null,
      avatar_url: initialProfile.show_logo ? avatarUrl : null,
      tagline: tagline.trim() || null,
      profile_style: style,
      feedback_rating_avg: initialProfile.show_stats ? initialProfile.feedback_rating_avg : null,
      feedback_rating_count: initialProfile.show_stats ? initialProfile.feedback_rating_count : null,
      proof_lab_rating_avg: initialProfile.show_stats ? initialProfile.proof_lab_rating_avg : null,
      proof_lab_rating_count: initialProfile.show_stats ? initialProfile.proof_lab_rating_count : null,
      categories: [],
      headline_stars: initialProfile.show_feedback_excerpts && pickedReview ? pickedReview.stars : null,
      headline_body: initialProfile.show_feedback_excerpts && pickedReview ? pickedReview.body : null,
      headline_source: pickedReview ? (pickedReview.source_type === "engaged_review" ? "engaged_review" : "match") : null,
    }),
    [words, avatarUrl, tagline, style, pickedReview, initialProfile],
  );
  const previewFeedback = useMemo(
    () => (initialProfile.show_feedback_excerpts
      ? approvedReviews.map((r) => ({ kind: "excerpt", body: r.body, stars: r.stars, created_at: r.created_at, source: r.source_type === "engaged_review" ? "engaged_review" : "match", product_name: null }))
      : []),
    [approvedReviews, initialProfile.show_feedback_excerpts],
  );

  const set = (key) => (v) => setStyle((s) => ({ ...s, [key]: v }));

  async function saveCard() {
    setError("");
    setNotice("");
    if (!isValidStyle(style)) {
      setError("Something in the style isn't allowed. Reset and try again.");
      return;
    }
    const clean = tagline.trim();
    const [type, id] = headline ? headline.split(":") : [null, null];
    setSaving(true);
    try {
      const { error: rpcErr } = await createClient().rpc("update_profile_card", {
        p_profile_style: style,
        p_tagline: clean || null,
        p_clear_tagline: !clean,
        p_headline_source_type: type,
        p_headline_source_id: id,
        p_clear_headline: !headline,
      });
      if (rpcErr) throw rpcErr;
      setSaved({ style, tagline: clean, headline });
      setTagline(clean);
      setNotice("Saved. Your card is live.");
    } catch (e) {
      setError(e.message || "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveWord(key) {
    setError("");
    const value = words[key].trim();
    if (value === (initialProfile[key] ?? "") || !value) return;
    try {
      const param = { display_name: "p_display_name", bio: "p_bio", location_text: "p_location_text" }[key];
      const { error: rpcErr } = await createClient().rpc("update_my_profile", { [param]: value });
      if (rpcErr) throw rpcErr;
      initialProfile[key] = value;
      setNotice("Saved.");
    } catch (e) {
      setError(e.message || "Couldn't save — please try again.");
    }
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    setUploading(true);
    try {
      const url = await uploadAvatar(createClient(), userId, file);
      setAvatarUrl(url);
      setNotice(initialProfile.show_logo ? "Photo updated." : "Photo uploaded. Turn on “Show logo / avatar” in publishing settings to show it.");
    } catch (err) {
      setError(err.message || "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  async function onRemovePhoto() {
    setError("");
    setUploading(true);
    try {
      await clearAvatar(createClient(), userId);
      setAvatarUrl(null);
      setNotice("Photo removed.");
    } catch (err) {
      setError(err.message || "Couldn't remove the photo.");
    } finally {
      setUploading(false);
    }
  }

  const sectionPad = isMobile ? "20px 16px 40px" : "32px 32px 64px";

  const previewPane = (
    <div
      style={{
        width: isMobile ? "100%" : 390,
        height: isMobile ? "min(72vh, 640px)" : 760,
        borderRadius: 32,
        border: "10px solid #2b2420",
        boxShadow: "0 24px 60px rgba(61,43,31,0.25)",
        overflow: "hidden",
        background: "#000",
        flexShrink: 0,
        position: isMobile ? "static" : "sticky",
        top: 88,
      }}
    >
      <ProfileCard embedded profile={preview} feedback={previewFeedback} links={links} />
    </div>
  );

  const controls = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {(error || notice) && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, fontFamily: FONT_SANS, fontSize: 14, fontWeight: 600, background: error ? "#FDECEC" : T.tealP, color: error ? T.red : T.teal }}>
          {error || notice}
        </div>
      )}

      {!initialProfile.public_username || !initialProfile.profile_public_enabled ? (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, fontFamily: FONT_SANS, fontSize: 13, background: `${T.gold}22`, color: T.brown }}>
          Your card isn’t public yet.{" "}
          <Link href="/account/public" style={{ color: T.orange, fontWeight: 700 }}>
            {initialProfile.public_username ? "Publish it in publishing settings →" : "Claim a handle and publish it →"}
          </Link>
        </div>
      ) : null}

      {/* Photo */}
      <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 16 }} hover={false}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Photo</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input ref={fileRef} type="file" accept={ACCEPT_ATTR} onChange={onPickFile} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: T.orange, color: "#fff", fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "Working…" : avatarUrl ? "Replace photo" : "Upload photo"}
          </button>
          {avatarUrl ? (
            <button type="button" onClick={onRemovePhoto} disabled={uploading} style={{ padding: "10px 18px", borderRadius: 10, border: "1.5px solid #E8DDD5", background: "#fff", color: T.brownM, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Remove
            </button>
          ) : null}
          <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>PNG, JPEG or WebP · a PNG with a transparent background floats on the card.</span>
        </div>
        {avatarUrl && !initialProfile.show_logo ? (
          <div style={{ marginTop: 10, fontFamily: FONT_SANS, fontSize: 13, color: T.brownM }}>
            Your photo is hidden publicly until “Show logo / avatar” is on in{" "}
            <Link href="/account/public" style={{ color: T.orange, fontWeight: 700 }}>publishing settings</Link>.
          </div>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <Field title="Backdrop inside the frame" hint="See-through lets a cut-out PNG float with its own shadow.">
            <Chips name="Photo backdrop" options={PHOTO_BGS} value={style.photoBg} onChange={set("photoBg")} />
          </Field>
        </div>
      </Card>

      {/* Frame */}
      <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 16 }} hover={false}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Frame</h2>
        <Field title="Shape"><Chips name="Frame shape" options={FRAME_SHAPES} value={style.shape} onChange={set("shape")} /></Field>
        {style.shape !== "none" ? (
          <>
            <Field title="Ring"><Chips name="Ring style" options={RING_STYLES} value={style.ring} onChange={set("ring")} /></Field>
            {style.ring !== "none" ? (
              <>
                <Field title="Ring width"><Chips name="Ring width" options={RING_WIDTHS} value={style.ringWidth} onChange={set("ringWidth")} /></Field>
                <Field title={style.ring === "gradient" ? "Ring colour · start" : "Ring colour"}>
                  <Swatches name="Ring colour" value={style.ringColor} onChange={set("ringColor")} />
                </Field>
                {style.ring === "gradient" ? (
                  <Field title="Ring colour · end"><Swatches name="Ring end colour" value={style.ringColor2} onChange={set("ringColor2")} /></Field>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        <Field title="Shadow"><Chips name="Shadow" options={SHADOWS} value={style.shadow} onChange={set("shadow")} /></Field>
      </Card>

      {/* Placement */}
      <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 16 }} hover={false}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Placement</h2>
        <Field title="Photo position"><PositionGrid value={style.photoPos} onChange={set("photoPos")} /></Field>
        <Field title="Name & tagline" hint="Auto puts the words opposite the photo and lines them up with it.">
          <Chips name="Text side" options={TEXT_SIDES} value={style.textSide} onChange={set("textSide")} />
          <div style={{ height: 8 }} />
          <Chips name="Text alignment" options={TEXT_ALIGNS} value={style.textAlign} onChange={set("textAlign")} />
        </Field>
      </Card>

      {/* Background */}
      <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 16 }} hover={false}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Background</h2>
        <Field title="Kind"><Chips name="Background kind" options={BG_KINDS} value={style.bgKind} onChange={set("bgKind")} /></Field>
        {style.bgKind === "preset" ? (
          <Field title="Preset"><Presets value={style.bgPreset} onChange={set("bgPreset")} /></Field>
        ) : (
          <>
            <Field title={style.bgKind === "gradient" ? "Colour · start" : "Colour"}>
              <Swatches name="Background colour" value={style.bgColor} onChange={set("bgColor")} />
            </Field>
            {style.bgKind === "gradient" ? (
              <Field title="Colour · end"><Swatches name="Background end colour" value={style.bgColor2} onChange={set("bgColor2")} /></Field>
            ) : null}
          </>
        )}
      </Card>

      {/* Words */}
      <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 16 }} hover={false}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Words</h2>
        <Field title="Name">
          <input value={words.display_name} onChange={(e) => setWords((w) => ({ ...w, display_name: e.target.value }))} onBlur={() => saveWord("display_name")} style={input} maxLength={80} />
        </Field>
        <Field title="Tagline" hint={`${tagline.length}/${TAGLINE_MAX} · one line under your name.`}>
          <input value={tagline} onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX))} placeholder="What you build, in a breath." style={input} maxLength={TAGLINE_MAX} />
        </Field>
        <Field title="Bio" hint="Shown on the About layer.">
          <textarea value={words.bio} onChange={(e) => setWords((w) => ({ ...w, bio: e.target.value }))} onBlur={() => saveWord("bio")} rows={4} style={{ ...input, resize: "vertical" }} />
        </Field>
        <Field title="Location">
          <input value={words.location_text} onChange={(e) => setWords((w) => ({ ...w, location_text: e.target.value }))} onBlur={() => saveWord("location_text")} style={input} maxLength={80} />
        </Field>
      </Card>

      {/* Headline review */}
      <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 16 }} hover={false}>
        <h2 style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: 800, color: T.brown, margin: "0 0 4px" }}>Headline review</h2>
        <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, margin: "0 0 14px" }}>
          One approved review to pin on the front of your card.{" "}
          {approvedReviews.length === 0 ? (
            <>Approve reviews in <Link href="/account/public" style={{ color: T.orange, fontWeight: 700 }}>publishing settings</Link> to pick one.</>
          ) : null}
        </p>
        <div role="radiogroup" aria-label="Headline review" style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${headline === null ? T.orange : "#E8DDD5"}`, background: headline === null ? T.orangeP : "#fff", cursor: "pointer", fontFamily: FONT_SANS, fontSize: 14, color: T.brown }}>
            <input type="radio" name="headline" checked={headline === null} onChange={() => setHeadline(null)} />
            None
          </label>
          {approvedReviews.map((r) => {
            const key = headlineKey(r.source_type, r.id);
            const on = headline === key;
            return (
              <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${on ? T.orange : "#E8DDD5"}`, background: on ? T.orangeP : "#fff", cursor: "pointer" }}>
                <input type="radio" name="headline" checked={on} onChange={() => setHeadline(key)} style={{ marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    {r.stars ? <Stars n={r.stars} size={14} /> : null}
                    <Pill color={T.teal}>{r.source_type === "engaged_review" ? "Engaged review" : "Member feedback"}</Pill>
                  </span>
                  <span style={{ display: "block", fontFamily: FONT_SERIF, fontStyle: "italic", fontSize: 14, color: T.brown, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    “{r.body}”
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      {/* Save bar */}
      <div style={{ position: "sticky", bottom: 12, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16, background: "#fff", border: "1.5px solid #F0E8E0", boxShadow: "0 8px 32px rgba(61,43,31,0.12)" }}>
        <span style={{ flex: 1, fontFamily: FONT_SANS, fontSize: 13, fontWeight: 600, color: dirty ? T.orange : T.slate }}>
          {dirty ? "Unsaved changes" : "Everything is saved"}
        </span>
        <button
          type="button"
          onClick={() => { setStyle(saved.style); setTagline(saved.tagline); setHeadline(saved.headline); }}
          disabled={!dirty || saving}
          style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #E8DDD5", background: "#fff", color: T.brownM, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: dirty ? "pointer" : "not-allowed", opacity: dirty ? 1 : 0.5 }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={saveCard}
          disabled={!dirty || saving}
          style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: T.orange, color: "#fff", fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: dirty ? "pointer" : "not-allowed", opacity: dirty ? 1 : 0.5, boxShadow: `0 4px 14px ${T.orange}44` }}
        >
          {saving ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: T.cream, minHeight: "70vh" }}>
      <section style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "36px 20px 28px" : "48px 32px 40px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <Pill color={T.gold}>Profile card</Pill>
          <h1 style={{ fontFamily: FONT_SERIF, fontSize: isMobile ? 30 : 40, fontWeight: 900, color: "#fff", margin: "12px 0 8px", letterSpacing: "-0.02em" }}>
            Design your card
          </h1>
          <p style={{ fontFamily: FONT_SANS, fontSize: 15, color: "#C4A68A", margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
            This is what a visitor sees first at /u/{initialProfile.public_username || "your-handle"}. Frame your photo, pick a background, say one line.
            {" "}
            <Link href="/account/public" style={{ color: T.goldL, fontWeight: 700 }}>What’s public is set in publishing settings →</Link>
          </p>
        </div>
      </section>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: sectionPad }}>
        {isMobile ? (
          <>
            <div role="tablist" aria-label="Editor view" style={{ display: "flex", gap: 6, padding: 4, borderRadius: 14, background: "#fff", border: "1.5px solid #F0E8E0", marginBottom: 16 }}>
              {["edit", "preview"].map((v) => (
                <button key={v} type="button" role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} style={{ flex: 1, minHeight: 40, border: "none", borderRadius: 10, background: mobileView === v ? T.orangeP : "transparent", color: mobileView === v ? T.orange : T.brown, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {v === "edit" ? "Edit" : "Preview"}
                </button>
              ))}
            </div>
            {mobileView === "edit" ? controls : previewPane}
          </>
        ) : (
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
            {controls}
            {previewPane}
          </div>
        )}
      </div>
    </div>
  );
}
