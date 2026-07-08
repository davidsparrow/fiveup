import { ImageResponse } from "next/og";

import { createClient } from "@/lib/supabase/server";
import { T } from "@/lib/fivestarz/theme";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ProofSignals profile";

// Dynamic per-page share card. Reads only the public projection (anon), so it
// never renders anything the profile page itself wouldn't show.
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

  return new ImageResponse(
    (
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
    ),
    { ...size },
  );
}
