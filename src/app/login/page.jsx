import Link from "next/link";

import { signIn } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  const message = params?.message;
  const next = typeof params?.next === "string" && params.next.startsWith("/") ? params.next : "/account";

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <Link href="/" style={styles.backLink}>
          ← Back to FiveStarz
        </Link>
        <p style={styles.kicker}>Supabase auth test</p>
        <h1 style={styles.title}>Log in</h1>
        <p style={styles.subtitle}>Use your Supabase email/password account to test the real session flow.</p>

        {message ? <div style={styles.success}>{message}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}

        <form action={signIn} style={styles.form}>
          <input type="hidden" name="next" value={next} />
          <label style={styles.label}>
            Email
            <input name="email" type="email" required autoComplete="email" style={styles.input} />
          </label>
          <label style={styles.label}>
            Password
            <input name="password" type="password" required autoComplete="current-password" style={styles.input} />
          </label>
          <button type="submit" style={styles.primaryButton}>
            Log in
          </button>
        </form>

        <p style={styles.footerText}>
          Need an account? <Link href="/signup" style={styles.inlineLink}>Create one here</Link>.
        </p>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 16px",
    background: "linear-gradient(160deg,#fff8f0 0%,#fff3e4 50%,#d4f5f1 100%)",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "#fff",
    border: "1px solid #f0e8e0",
    borderRadius: 24,
    boxShadow: "0 16px 48px rgba(61,43,31,0.12)",
    padding: 32,
  },
  backLink: { color: "#a0644a", textDecoration: "none", fontWeight: 700 },
  kicker: { margin: "20px 0 8px", color: "#1a9e8f", fontWeight: 700, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.08em" },
  title: { margin: 0, color: "#3d2b1f", fontSize: 36, lineHeight: 1.1 },
  subtitle: { margin: "12px 0 0", color: "#4a5568", lineHeight: 1.6 },
  success: { marginTop: 20, padding: "12px 14px", borderRadius: 12, background: "#c6f6d5", color: "#1f6f43", fontWeight: 600 },
  error: { marginTop: 20, padding: "12px 14px", borderRadius: 12, background: "#fff0f0", color: "#c53030", fontWeight: 600 },
  form: { display: "grid", gap: 16, marginTop: 24 },
  label: { display: "grid", gap: 8, color: "#3d2b1f", fontWeight: 700 },
  input: { borderRadius: 12, border: "1.5px solid #e8ddd5", padding: "12px 14px", fontSize: 16, outline: "none", background: "#fffaf5" },
  primaryButton: { border: "none", borderRadius: 12, padding: "14px 18px", background: "#ff6b35", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 24px rgba(255,107,53,0.25)" },
  footerText: { margin: "20px 0 0", color: "#6b4226" },
  inlineLink: { color: "#ff6b35", fontWeight: 700 },
};