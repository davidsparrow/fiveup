"use client";

import { useState } from "react";

import { Pill } from "@/components/fivestarz/ui";
import { initials } from "@/lib/fivestarz/format";

import FramedPhoto from "../FramedPhoto";
import StarRating from "../StarRating";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

function StatTile({ value, count, label, resolved }) {
  const { textColor, mutedTextColor, onDark } = resolved;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "12px 14px",
        borderRadius: 16,
        background: onDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.78)",
        border: `1px solid ${onDark ? "rgba(255,255,255,0.16)" : "rgba(61,43,31,0.08)"}`,
        color: textColor,
      }}
    >
      <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: mutedTextColor, marginBottom: 6 }}>
        {label}
      </div>
      <StarRating value={value} count={count} size={16} textColor={textColor} mutedColor={mutedTextColor} emptyColor={onDark ? "rgba(255,255,255,0.28)" : "rgba(61,43,31,0.18)"} />
    </div>
  );
}

/** Bio, location, categories, and the two star averages. The bio is the only
 *  thing here allowed to grow; past 8 lines it clamps with a "Read more"
 *  that scrolls inside its own box. */
export default function AboutLayer({ profile, resolved }) {
  const [expanded, setExpanded] = useState(false);
  const { textColor, mutedTextColor, onDark } = resolved;

  const fAvg = profile.feedback_rating_avg != null ? Number(profile.feedback_rating_avg) : null;
  const fCount = profile.feedback_rating_count ?? 0;
  const pAvg = profile.proof_lab_rating_avg != null ? Number(profile.proof_lab_rating_avg) : null;
  const pCount = profile.proof_lab_rating_count ?? 0;
  const categories = (profile.categories ?? []).slice(0, 6);
  const extra = (profile.categories ?? []).length - categories.length;
  const longBio = (profile.bio ?? "").length > 420;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px 12px", color: textColor, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <FramedPhoto src={profile.avatar_url} alt="" initials={initials(profile.display_name)} style={resolved.style} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_SERIF, fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile.display_name}
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: mutedTextColor, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{profile.public_username}
            {profile.location_text ? ` · 📍 ${profile.location_text}` : ""}
          </div>
        </div>
      </div>

      {(fAvg != null && fCount > 0) || (pAvg != null && pCount > 0) ? (
        <div style={{ display: "flex", gap: 10 }}>
          {fAvg != null && fCount > 0 ? <StatTile value={fAvg} count={fCount} label="Feedback" resolved={resolved} /> : null}
          {pAvg != null && pCount > 0 ? <StatTile value={pAvg} count={pCount} label="Proof Market" resolved={resolved} /> : null}
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <Pill key={c} color={onDark ? "#FDD07A" : "#6B4226"} bg={onDark ? "rgba(253,208,122,0.18)" : "rgba(107,66,38,0.1)"}>
              {c}
            </Pill>
          ))}
          {extra > 0 ? <Pill color={mutedTextColor} bg="transparent">+{extra}</Pill> : null}
        </div>
      ) : null}

      {profile.bio ? (
        <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <p
            data-no-swipe={expanded ? "" : undefined}
            style={{
              margin: 0,
              fontFamily: FONT_SANS,
              fontSize: 15,
              lineHeight: 1.6,
              color: textColor,
              minHeight: 0,
              ...(expanded
                ? { overflowY: "auto", overscrollBehavior: "contain" }
                : { display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" }),
            }}
          >
            {profile.bio}
          </p>
          {longBio ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: textColor, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : (
        <p style={{ margin: 0, fontFamily: FONT_SANS, fontSize: 14, color: mutedTextColor }}>No bio yet.</p>
      )}
    </div>
  );
}
