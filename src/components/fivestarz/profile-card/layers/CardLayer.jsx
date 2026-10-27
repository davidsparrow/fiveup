import { Pill, Stars } from "@/components/fivestarz/ui";
import { initials } from "@/lib/fivestarz/format";

import FramedPhoto from "../FramedPhoto";
import StarRating from "../StarRating";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" };

/**
 * The landing layer: photo in its anchor slot, name + tagline opposite, the
 * star average, and the optional headline review. Graphic-heavy, text-light.
 * Two equal rows so the photo and the words never fight for the same space;
 * which row holds which comes from the style.
 */
export default function CardLayer({ profile, resolved, hasReviews }) {
  const { photoCorner, textCorner, textColor, mutedTextColor, onDark } = resolved;
  const photoOnTop = photoCorner.v === "top";
  const textOnTop = textCorner.v === "top";
  const sameRow = photoOnTop === textOnTop; // member forced both into one half

  const avg = profile.feedback_rating_avg != null ? Number(profile.feedback_rating_avg) : null;
  const count = profile.feedback_rating_count ?? 0;
  const showAvg = avg != null && count > 0;

  // The photo takes whatever height the words leave it (see FramedPhoto's
  // `fit`), so a long headline on a short phone shrinks the photo instead of
  // pushing anything off the card.
  const photo = (
    <div
      style={{
        display: "flex",
        justifyContent: JUSTIFY[photoCorner.h],
        alignItems: photoOnTop ? "flex-start" : "flex-end",
        padding: "6px 4px",
        height: "100%",
        minHeight: 0,
      }}
    >
      <FramedPhoto
        fit
        src={profile.avatar_url}
        alt={profile.display_name ? `${profile.display_name}` : "Member photo"}
        initials={initials(profile.display_name)}
        style={resolved.style}
        size={sameRow ? 200 : 300}
      />
    </div>
  );

  // Name first in the DOM and top-justified inside an overflow-hidden box, so
  // when a short phone runs out of room it is the headline and the hint that
  // get cut (the media queries in ProfileCard drop them cleanly first), never
  // the name. The row wrapper handles top/bottom placement.
  const words = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: JUSTIFY[textCorner.h],
        textAlign: textCorner.h,
        color: textColor,
        minWidth: 0,
        padding: "4px 4px",
        gap: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ minWidth: 0, maxWidth: "100%" }}>
        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontWeight: 900,
            fontSize: "clamp(28px, 8vw, 40px)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textShadow: onDark ? "0 2px 18px rgba(0,0,0,0.25)" : "none",
          }}
        >
          {profile.display_name}
        </h1>
        {profile.tagline ? (
          <p
            style={{
              fontFamily: FONT_SANS,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.4,
              margin: "8px 0 0",
              color: mutedTextColor,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {profile.tagline}
          </p>
        ) : null}
      </div>

      {showAvg ? (
        <StarRating value={avg} count={count} size={20} textColor={textColor} mutedColor={mutedTextColor} emptyColor={onDark ? "rgba(255,255,255,0.28)" : "rgba(61,43,31,0.18)"} />
      ) : null}

      {profile.headline_body ? (
        <figure
          className="ps-headline"
          style={{
            margin: 0,
            maxWidth: 360,
            padding: "12px 14px",
            borderRadius: 16,
            background: onDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)",
            border: `1px solid ${onDark ? "rgba(255,255,255,0.18)" : "rgba(61,43,31,0.08)"}`,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {profile.headline_stars ? <Stars n={profile.headline_stars} size={14} /> : null}
            <Pill color={onDark ? "#FDD07A" : "#1A9E8F"} bg={onDark ? "rgba(253,208,122,0.18)" : "rgba(26,158,143,0.12)"}>
              {profile.headline_source === "engaged_review" ? "Engaged review" : "Member feedback"}
            </Pill>
          </div>
          <blockquote
            style={{
              margin: 0,
              fontFamily: FONT_SERIF,
              fontStyle: "italic",
              fontSize: 15,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            “{profile.headline_body}”
          </blockquote>
        </figure>
      ) : null}

      {hasReviews ? (
        <div className="ps-hint" style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: mutedTextColor, opacity: 0.7 }}>
          swipe for reviews →
        </div>
      ) : null}
    </div>
  );

  if (sameRow) {
    // Photo and words share one half; the other half breathes.
    const block = (
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 14, alignItems: "center", minHeight: 0, height: "100%" }}>
        {photoCorner.h === "right" ? (
          <>
            {words}
            {photo}
          </>
        ) : (
          <>
            {photo}
            {words}
          </>
        )}
      </div>
    );
    return (
      <div style={{ display: "grid", gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)", height: "100%", padding: "18px 18px 12px", minHeight: 0 }}>
        {photoOnTop ? block : <div />}
        {photoOnTop ? <div /> : block}
      </div>
    );
  }

  // Words take what they need (every block is clamped, and the media queries
  // in ProfileCard drop the headline and hint on short phones); the photo row
  // gets the rest but never less than 120px, so the words can't push it out.
  // No percentage caps here: a percent max-height on a grid item resolves
  // against its own (content-sized) track and clips the words.
  const rows = photoOnTop ? "minmax(120px,1fr) auto" : "auto minmax(120px,1fr)";
  const wordsRow = <div style={{ minHeight: 0, display: "flex", flexDirection: "column", justifyContent: textOnTop ? "flex-start" : "flex-end" }}>{words}</div>;

  return (
    <div style={{ display: "grid", gridTemplateRows: rows, height: "100%", padding: "18px 18px 12px", minHeight: 0, overflow: "hidden" }}>
      {photoOnTop ? photo : wordsRow}
      {photoOnTop ? wordsRow : photo}
    </div>
  );
}
