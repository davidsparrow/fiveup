import { ImageResponse } from "next/og";

import { normalizeStyle, PALETTE, resolveStyle } from "@/components/fivestarz/profile-card/cardStyle";
import { initials } from "@/lib/fivestarz/format";
import { createClient } from "@/lib/supabase/server";
import { T } from "@/lib/fivestarz/theme";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ProofSignals profile";

const STAR_PATH = "M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z";

// Satori has no clip-path, so the squircle and arch degrade to radii here.
function ogRadius(shape) {
  switch (shape) {
    case "circle": return "50%";
    case "rounded":
    case "squircle": return "28%";
    case "arch": return "999px 999px 24px 24px";
    default: return "0";
  }
}

function TextOnly({ name, handle }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px 90px",
        background: `linear-gradient(135deg, ${T.brown} 0%, ${T.brownM} 100%)`,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: T.gold, letterSpacing: "-0.5px" }}>
        ProofSignals
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 900, color: "#ffffff", letterSpacing: "-2px", lineHeight: 1.05 }}>
          {name}
        </div>
        {handle ? (
          <div style={{ display: "flex", marginTop: 16, fontSize: 40, fontWeight: 600, color: "#C4A68A" }}>
            {handle}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", fontSize: 28, color: "#C4A68A" }}>
        Honest feedback from founders who actually get it.
      </div>
    </div>
  );
}

// Dynamic per-page share card. Reads only the public projection (anon), so it
// never renders anything the profile page itself wouldn't show. Draws the
// same framed photo, background and star average the card does.
export default async function Image({ params }) {
  const { username } = await params;

  let profile = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_profile", { p_username: username });
    profile = data?.[0] ?? null;
  } catch {
    profile = null;
  }

  const name = profile?.display_name || "ProofSignals";
  const handle = profile?.public_username ? `@${profile.public_username}` : "";

  if (!profile) {
    return new ImageResponse(<TextOnly name={name} handle={handle} />, { ...size });
  }

  try {
    const r = resolveStyle(normalizeStyle(profile.profile_style));
    const radius = ogRadius(r.shape);
    const photoSize = r.shape === "arch" ? { width: 300, height: 375 } : { width: 320, height: 320 };
    const avg = profile.feedback_rating_avg != null ? Number(profile.feedback_rating_avg) : null;
    const count = profile.feedback_rating_count ?? 0;
    const showAvg = avg != null && count > 0;
    const blurb = profile.tagline || handle;
    const textColor = r.textColor;
    const muted = r.onDark ? "rgba(255,255,255,0.78)" : T.brownM;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "70px 90px",
            background: r.backgroundCss,
            fontFamily: "sans-serif",
            color: textColor,
          }}
        >
          {/* framed photo */}
          <div
            style={{
              display: "flex",
              padding: r.ringWidthPx * 2,
              background: r.ringCss ?? "transparent",
              borderRadius: radius,
              boxShadow: r.shadowCss ?? undefined,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                ...photoSize,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderRadius: radius,
                background: profile.avatar_url ? r.photoBgCss : PALETTE.orange,
              }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" width={photoSize.width} height={photoSize.height} style={{ objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", fontSize: 120, fontWeight: 700, color: "#fff" }}>{initials(profile.display_name)}</div>
              )}
            </div>
          </div>

          {/* words */}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 70, flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: r.onDark ? T.goldL : T.orange, letterSpacing: "-0.5px", marginBottom: 18 }}>
              ProofSignals
            </div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.05 }}>
              {name}
            </div>
            {blurb ? (
              <div style={{ display: "flex", marginTop: 16, fontSize: 32, fontWeight: 500, color: muted, lineHeight: 1.3 }}>
                {blurb}
              </div>
            ) : null}
            {showAvg ? (
              <div style={{ display: "flex", alignItems: "center", marginTop: 28 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <svg key={i} width="44" height="44" viewBox="0 0 20 20" style={{ marginRight: 6 }}>
                    <path d={STAR_PATH} fill={i <= Math.round(avg) ? T.gold : r.onDark ? "rgba(255,255,255,0.3)" : "rgba(61,43,31,0.18)"} />
                  </svg>
                ))}
                <div style={{ display: "flex", marginLeft: 14, fontSize: 34, fontWeight: 700 }}>
                  {avg.toFixed(1)}
                  <span style={{ marginLeft: 10, fontWeight: 500, color: muted }}>
                    from {count} {count === 1 ? "review" : "reviews"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ),
      { ...size },
    );
  } catch {
    return new ImageResponse(<TextOnly name={name} handle={handle} />, { ...size });
  }
}
