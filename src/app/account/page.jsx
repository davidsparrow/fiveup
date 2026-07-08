import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const name = user.user_metadata?.full_name || user.user_metadata?.name || "FiveStarz member";

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <p style={styles.kicker}>Authenticated</p>
            <h1 style={styles.title}>Account</h1>
          </div>
          <Link href="/" style={styles.homeLink}>
            Back to demo
          </Link>
        </div>

        <div style={styles.infoBlock}>
          <p style={styles.infoLabel}>Name</p>
          <p style={styles.infoValue}>{name}</p>
        </div>

        <div style={styles.infoBlock}>
          <p style={styles.infoLabel}>Email</p>
          <p style={styles.infoValue}>{user.email}</p>
        </div>

        <div style={styles.infoBlock}>
          <p style={styles.infoLabel}>User ID</p>
          <p style={styles.infoMono}>{user.id}</p>
        </div>

        <Link href="/account/public" style={styles.settingsLink}>
          Manage public profile & publishing →
        </Link>

        <form action={signOut}>
          <button type="submit" style={styles.primaryButton}>
            Sign out
          </button>
        </form>
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
    background: "linear-gradient(160deg,#fff8f0 0%,#fff 45%,#d4f5f1 100%)",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    background: "#fff",
    border: "1px solid #f0e8e0",
    borderRadius: 24,
    boxShadow: "0 16px 48px rgba(61,43,31,0.12)",
    padding: 32,
  },
  headerRow: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 },
  kicker: { margin: 0, color: "#1a9e8f", fontWeight: 700, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.08em" },
  title: { margin: "8px 0 0", color: "#3d2b1f", fontSize: 36, lineHeight: 1.1 },
  homeLink: { color: "#ff6b35", textDecoration: "none", fontWeight: 700 },
  infoBlock: { padding: "16px 18px", borderRadius: 16, background: "#fff8f0", border: "1px solid #f0e8e0", marginBottom: 14 },
  infoLabel: { margin: 0, color: "#a0644a", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 },
  infoValue: { margin: "8px 0 0", color: "#3d2b1f", fontSize: 18, fontWeight: 700 },
  infoMono: { margin: "8px 0 0", color: "#4a5568", fontSize: 14, fontFamily: "monospace", wordBreak: "break-all" },
  primaryButton: { marginTop: 10, border: "none", borderRadius: 12, padding: "14px 18px", background: "#ff6b35", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 24px rgba(255,107,53,0.25)" },
  settingsLink: { display: "block", textAlign: "center", margin: "4px 0 18px", padding: "13px 18px", borderRadius: 12, background: "#1a9e8f", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" },
};