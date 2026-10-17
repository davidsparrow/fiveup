"use client";

// The Track picker on /account.
//
// It lives here rather than on /account/preferences deliberately: that page is
// part of the archived web matching surface and redirects to Discord whenever
// the match_surface gate is not 'web', so a Track control there would
// disappear the day D3 flips the gate — taking the thing D3 needs with it.
// A Track is identity, not a matching preference.
//
// One Track per member. It is where someone came in, from the Skool join
// poll, and it decides which standing channel they are pinged in and which
// recommendations a Track-scoped group makes. Belonging to several rooms at
// once is what groups are for.

import { useState } from "react";

import { TRACKS } from "@/lib/fivestarz/tracks";
import { setMemberTrack } from "@/lib/fivestarz/data";
import { createClient } from "@/lib/supabase/client";

export default function TrackCard({ track = null }) {
  const [current, setCurrent] = useState(track);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function choose(key) {
    const next = current === key ? null : key;
    setBusy(key);
    setError(null);
    try {
      const supabase = createClient();
      await setMemberTrack(supabase, { track: next });
      setCurrent(next);
    } catch (err) {
      setError(err.message ?? "Could not save your Track.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={styles.card}>
      <p style={styles.label}>Your Track</p>
      <p style={styles.help}>
        Where you came in. It sets your standing channel in the Discord server and sharpens who a
        Track-scoped feedback group suggests. Pick one, or leave it unset to stay cross-track.
      </p>

      <div style={styles.grid}>
        {TRACKS.map((t) => {
          const selected = current === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => choose(t.key)}
              disabled={busy !== null}
              style={{
                ...styles.option,
                borderColor: selected ? "#1a9e8f" : "#f0e8e0",
                background: selected ? "#d4f5f1" : "#fff",
                cursor: busy !== null ? "wait" : "pointer",
              }}
            >
              <span style={styles.optionTop}>
                <span style={styles.optionName}>{t.label}</span>
                {selected && <span style={styles.tick}>✓</span>}
              </span>
              <span style={styles.optionBlurb}>{t.blurb}</span>
              <span style={styles.channel}>{t.channel}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <p style={styles.note}>
          Tap {TRACKS.find((t) => t.key === current)?.label} again to clear it.
        </p>
      )}
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  card: { padding: "16px 18px", borderRadius: 16, background: "#fff8f0", border: "1px solid #f0e8e0", marginBottom: 14 },
  label: { margin: 0, color: "#a0644a", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 },
  help: { margin: "8px 0 14px", color: "#4a5568", fontSize: 14, lineHeight: 1.5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 },
  option: { textAlign: "left", display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px", borderRadius: 12, border: "1.5px solid #f0e8e0", transition: "all 0.18s" },
  optionTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  optionName: { color: "#3d2b1f", fontSize: 15, fontWeight: 700 },
  tick: { color: "#1a9e8f", fontWeight: 700 },
  optionBlurb: { color: "#4a5568", fontSize: 12.5, lineHeight: 1.4 },
  channel: { color: "#a0644a", fontSize: 11.5, fontFamily: "monospace" },
  note: { margin: "12px 0 0", color: "#a0644a", fontSize: 12.5 },
  error: { margin: "10px 0 0", color: "#e53e3e", fontSize: 13, fontWeight: 600 },
};
