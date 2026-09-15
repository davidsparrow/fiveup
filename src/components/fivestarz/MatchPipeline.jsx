"use client";

import { T } from "@/lib/fivestarz/theme";
import { matchPipelineStages } from "@/lib/fivestarz/match-pipeline";

const FONT_SANS = "'DM Sans',sans-serif";

const DOT = {
  done: { background: T.teal, border: `2px solid ${T.teal}`, color: "#fff" },
  current: { background: "#fff", border: `2px solid ${T.orange}`, color: T.orange },
  pending: { background: "#fff", border: "2px solid #D8CCC2", color: "#D8CCC2" },
  blocked: { background: "#F5EEE7", border: "2px solid #D8CCC2", color: "#B8AA9C" },
};
const LABEL_COLOR = {
  done: T.brown,
  current: T.orange,
  pending: "#B8AA9C",
  blocked: "#B8AA9C",
};

// Horizontal per-match progress strip: matched → your feedback → their
// feedback → post requested → posted. Renders nothing when the match has no
// pipeline (queued, or cancelled before any progress).
export default function MatchPipeline({ match, isMobile }) {
  const stages = matchPipelineStages(match);
  if (!stages) return null;

  return (
    <div
      aria-label="Match progress"
      style={{
        display: "flex",
        alignItems: "flex-start",
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid #F0E8E0",
        overflowX: isMobile ? "auto" : "visible",
      }}
    >
      {stages.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: i < stages.length - 1 ? 1 : "0 0 auto", minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: isMobile ? 62 : 76 }}>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 800,
                fontFamily: FONT_SANS,
                flexShrink: 0,
                boxSizing: "border-box",
                ...DOT[s.state],
              }}
            >
              {s.state === "done" ? "✓" : s.state === "blocked" ? "✕" : i + 1}
            </span>
            <span
              style={{
                fontFamily: FONT_SANS,
                fontSize: 11,
                fontWeight: s.state === "current" ? 700 : 600,
                color: LABEL_COLOR[s.state],
                textAlign: "center",
                lineHeight: 1.25,
              }}
            >
              {s.label}
            </span>
          </div>
          {i < stages.length - 1 && (
            <span
              style={{
                flex: 1,
                height: 2,
                marginTop: 9,
                minWidth: 10,
                borderRadius: 2,
                background: s.state === "done" ? T.teal : "#E4D9CE",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
