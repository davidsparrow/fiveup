import { ImageResponse } from "next/og";

import { createClient } from "@/lib/supabase/server";
import { T } from "@/lib/fivestarz/theme";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ProofSignals asset";

// Dynamic share card for a public asset. Reads only the public projection.
export default async function Image({ params }) {
  const { slug } = await params;

  let asset = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_asset", { p_slug: slug });
    asset = data?.[0] ?? null;
  } catch {
    asset = null;
  }

  const name = asset?.name || "ProofSignals";
  const kind = asset?.asset_type ? asset.asset_type.replace(/_/g, " ") : "";
  const by = asset?.owner_display_name ? `by ${asset.owner_display_name}` : "";

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: T.gold, letterSpacing: "-0.5px" }}>
            ProofSignals
          </div>
          {kind ? (
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#C4A68A", textTransform: "capitalize" }}>
              {kind}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 900, color: "#ffffff", letterSpacing: "-2px", lineHeight: 1.05 }}>
            {name}
          </div>
          {by ? (
            <div style={{ display: "flex", marginTop: 16, fontSize: 36, fontWeight: 600, color: "#C4A68A" }}>
              {by}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#C4A68A" }}>
          Public proof, earned through real feedback.
        </div>
      </div>
    ),
    { ...size },
  );
}
