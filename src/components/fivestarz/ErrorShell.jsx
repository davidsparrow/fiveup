"use client";

import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";

/**
 * Reusable error / not-found layout: a centered slot for a silly animation
 * with the message directly below it, plus an optional action link.
 *
 * The animation slot renders `animation` when supplied (drop in a Lottie /
 * GIF / SVG element here). Until a real asset is provided it falls back to a
 * lightweight animated placeholder so the layout is complete and shippable.
 */
export default function ErrorShell({
  animation = null,
  code = "",
  title = "Something went sideways",
  message = "",
  actionHref = "/",
  actionLabel = "Back to home",
}) {
  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "64px 24px",
        background: T.cream,
      }}
    >
      <style>{`
        @keyframes fivestarz-error-bob {
          0%,100% { transform: translateY(0) rotate(-3deg); }
          50%     { transform: translateY(-14px) rotate(3deg); }
        }
      `}</style>

      {/* Centered animation slot */}
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        {animation ?? (
          <div
            aria-hidden="true"
            style={{
              fontSize: 88,
              lineHeight: 1,
              animation: "fivestarz-error-bob 2.4s ease-in-out infinite",
              filter: "drop-shadow(0 8px 18px rgba(61,43,31,0.18))",
            }}
          >
            🙈
          </div>
        )}
      </div>

      {/* Message below the animation */}
      {code ? (
        <div
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.orange,
            marginBottom: 10,
          }}
        >
          {code}
        </div>
      ) : null}

      <h1
        style={{
          fontFamily: "'Fraunces',serif",
          fontSize: 34,
          fontWeight: 900,
          color: T.brown,
          margin: "0 0 12px",
          letterSpacing: "-0.02em",
          maxWidth: 560,
        }}
      >
        {title}
      </h1>

      {message ? (
        <p
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize: 16,
            color: T.slate,
            lineHeight: 1.65,
            maxWidth: 460,
            margin: "0 0 28px",
          }}
        >
          {message}
        </p>
      ) : null}

      {actionHref ? (
        <Link
          href={actionHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "12px 26px",
            borderRadius: 12,
            background: T.orange,
            color: "#fff",
            fontFamily: "'DM Sans',sans-serif",
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
            boxShadow: `0 4px 14px ${T.orange}44`,
          }}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
