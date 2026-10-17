"use client";

// The Discord block on /account — both roads, one card.
//
// One-click OAuth for someone already on the site, and a code box for
// someone who found Discord first and ran /link there. Which controls show
// depends on what is actually configured, so the card never offers a button
// that cannot work.

import { useState } from "react";

import { formatLinkCode, isWellFormedLinkCode } from "@/lib/community/rules/link-codes";
import { createClient } from "@/lib/supabase/client";

export default function DiscordLinkCard({
  identity = null,
  oauthEnabled = false,
  codeEnabled = false,
  inviteUrl = null,
  initialMessage = null,
}) {
  const [linked, setLinked] = useState(identity);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState(null);

  const roleMissing = linked && !linked.role_granted_at;

  async function startOAuth() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
        "/account/discord/linked",
      )}`;
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "discord",
        options: { redirectTo },
      });

      if (linkError) {
        // Someone who signed up with Discord already has the identity
        // attached; there is nothing to link, only to record.
        if (/already/i.test(linkError.message)) {
          window.location.href = "/account/discord/linked";
          return;
        }
        throw linkError;
      }
    } catch (err) {
      setError(err.message ?? "Could not start Discord sign-in.");
      setBusy(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isWellFormedLinkCode(code)) {
      setError("A link code is 8 characters, like FP3K-9H2M.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/discord/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload.message ?? "Could not connect Discord.");
        return;
      }

      setLinked({
        handle: payload.handle,
        role_granted_at: payload.roleGranted ? new Date().toISOString() : null,
      });
      setMessage(payload.message);
      setCode("");
    } catch (err) {
      setError(err.message ?? "Could not connect Discord.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/discord/link", { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload.message ?? "Could not disconnect Discord.");
        return;
      }

      setLinked(null);
      setMessage(payload.message);
    } catch (err) {
      setError(err.message ?? "Could not disconnect Discord.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <p style={styles.label}>Discord</p>
        <span style={linked ? styles.pillOn : styles.pillOff}>
          {linked ? "Connected" : "Not connected"}
        </span>
      </div>

      {linked ? (
        <>
          <p style={styles.value}>{linked.handle || "Discord account linked"}</p>
          {roleMissing ? (
            <p style={styles.note}>
              Your Member role has not been granted yet.{" "}
              {inviteUrl ? (
                <>
                  Join the server at{" "}
                  <a href={inviteUrl} style={styles.link} target="_blank" rel="noreferrer">
                    the invite link
                  </a>{" "}
                  and run <code style={styles.code}>/link</code> again.
                </>
              ) : (
                <>
                  Run <code style={styles.code}>/link</code> in the server again to retry.
                </>
              )}
            </p>
          ) : null}
          <button type="button" onClick={disconnect} disabled={busy} style={styles.secondaryButton}>
            {busy ? "Working…" : "Disconnect Discord"}
          </button>
        </>
      ) : (
        <>
          <p style={styles.note}>
            Linking is what turns on the server: Tracks, groups and feedback rooms are closed until
            your Discord account is connected to this one.
          </p>

          {oauthEnabled ? (
            <button type="button" onClick={startOAuth} disabled={busy} style={styles.discordButton}>
              {busy ? "Opening Discord…" : "Connect with Discord"}
            </button>
          ) : null}

          {codeEnabled ? (
            <form onSubmit={submitCode} style={styles.form}>
              <label htmlFor="discord-link-code" style={styles.formLabel}>
                Or paste the code from <code style={styles.code}>/link</code>
              </label>
              <div style={styles.formRow}>
                <input
                  id="discord-link-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="FP3K-9H2M"
                  autoComplete="off"
                  spellCheck={false}
                  style={styles.input}
                />
                <button type="submit" disabled={busy} style={styles.primaryButton}>
                  {busy ? "…" : "Connect"}
                </button>
              </div>
              {code && isWellFormedLinkCode(code) ? (
                <p style={styles.hint}>Reading that as {formatLinkCode(code)}.</p>
              ) : null}
            </form>
          ) : null}

          {!oauthEnabled && !codeEnabled ? (
            <p style={styles.note}>Discord linking is not switched on in this environment yet.</p>
          ) : null}
        </>
      )}

      {message ? <p style={styles.success}>{message}</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}
    </div>
  );
}

const styles = {
  card: {
    padding: "16px 18px",
    borderRadius: 16,
    background: "#fff8f0",
    border: "1px solid #f0e8e0",
    marginBottom: 14,
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  label: {
    margin: 0,
    color: "#a0644a",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
  },
  pillOn: {
    background: "#1a9e8f",
    color: "#fff",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  pillOff: {
    background: "#f0e8e0",
    color: "#6b4226",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  value: { margin: "10px 0 0", color: "#3d2b1f", fontSize: 18, fontWeight: 700 },
  note: { margin: "10px 0 0", color: "#6b4226", fontSize: 13, lineHeight: 1.5 },
  hint: { margin: "8px 0 0", color: "#a0644a", fontSize: 12 },
  code: { background: "#f0e8e0", borderRadius: 4, padding: "1px 5px", fontSize: 12 },
  link: { color: "#ff6b35", fontWeight: 700 },
  form: { marginTop: 14 },
  formLabel: { display: "block", color: "#6b4226", fontSize: 13, marginBottom: 6 },
  formRow: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    border: "1px solid #e4d8cc",
    borderRadius: 10,
    padding: "11px 12px",
    fontSize: 15,
    fontFamily: "monospace",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  primaryButton: {
    border: "none",
    borderRadius: 10,
    padding: "11px 16px",
    background: "#ff6b35",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  discordButton: {
    marginTop: 12,
    width: "100%",
    border: "none",
    borderRadius: 12,
    padding: "13px 18px",
    background: "#5865f2",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    marginTop: 14,
    border: "1px solid #e4d8cc",
    borderRadius: 10,
    padding: "10px 14px",
    background: "#fff",
    color: "#6b4226",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  success: { margin: "12px 0 0", color: "#1a9e8f", fontSize: 13, fontWeight: 600 },
  error: { margin: "12px 0 0", color: "#c0392b", fontSize: 13, fontWeight: 600 },
};
