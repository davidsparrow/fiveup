"use client";

import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Card, Pill } from "@/components/fivestarz/ui";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

/**
 * Public asset page. Owner identity always shows (brand_visibility dormant in
 * 8d); it becomes a link to /u/[owner_username] only when the RPC returned a
 * username, i.e. the owner's own profile is public.
 */
export default function PublicAssetPage({ asset }) {
  const isMobile = useIsMobile();
  const assetType = asset.asset_type ? asset.asset_type.replace(/_/g, " ") : null;
  const published = formatDate(asset.created_at);

  const owner = asset.owner_display_name ? (
    asset.owner_username ? (
      <Link href={`/u/${asset.owner_username}`} style={{ color: T.orange, fontWeight: 700, textDecoration: "none" }}>
        {asset.owner_display_name}
      </Link>
    ) : (
      <span style={{ color: T.brown, fontWeight: 700 }}>{asset.owner_display_name}</span>
    )
  ) : null;

  return (
    <div style={{ background: T.cream, minHeight: "70vh" }}>
      {/* ── Hero ── */}
      <section
        style={{
          background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`,
          padding: isMobile ? "48px 20px 40px" : "72px 32px 56px",
        }}
      >
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {assetType ? (
            <Pill color={T.gold} bg={`${T.gold}22`}>
              {assetType}
            </Pill>
          ) : null}
          <h1
            style={{
              fontFamily: FONT_SERIF,
              fontSize: isMobile ? 34 : 48,
              fontWeight: 900,
              color: "#fff",
              margin: "14px 0 0",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {asset.name}
          </h1>
          {(owner || published) && (
            <div style={{ fontFamily: FONT_SANS, fontSize: 15, color: "#C4A68A", marginTop: 14 }}>
              {owner ? <>by {owner}</> : null}
              {owner && published ? <span style={{ margin: "0 8px" }}>·</span> : null}
              {published ? <>Published {published}</> : null}
            </div>
          )}
        </div>
      </section>

      {/* ── Body ── */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: isMobile ? "36px 16px 48px" : "48px 32px 64px" }}>
        {asset.description ? (
          <Card sx={{ padding: isMobile ? 24 : 36 }} hover={false}>
            <p
              style={{
                fontFamily: FONT_SANS,
                fontSize: 16,
                color: T.slate,
                lineHeight: 1.8,
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {asset.description}
            </p>
          </Card>
        ) : (
          <p style={{ fontFamily: FONT_SANS, fontSize: 15, color: T.slate }}>
            No description provided for this piece.
          </p>
        )}

        {asset.owner_username ? (
          <div style={{ marginTop: 28 }}>
            <Link
              href={`/u/${asset.owner_username}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: FONT_SANS,
                fontSize: 14,
                fontWeight: 700,
                color: T.teal,
                textDecoration: "none",
              }}
            >
              See more from {asset.owner_display_name} →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
