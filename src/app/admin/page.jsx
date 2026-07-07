import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getModerationAccess,
  listModerationQueue,
  listDealsAwaitingConfirmation,
} from "@/lib/fivestarz/data";
import { resolveFlagAction } from "./actions";

export const metadata = {
  title: "Moderation console | FiveStarz",
};

const STATUSES = ["pending", "reviewing", "resolved", "dismissed"];
const CONTENT_LABEL = {
  profile_bio: "Profile bio",
  feedback: "Match feedback",
  asset: "Asset",
  proof_lab_listing: "Proof Lab listing",
  deal_note: "Deal request note",
  proof_lab_review: "Engaged-reviewer review",
};

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default async function AdminPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const status = STATUSES.includes(sp.status) ? sp.status : "pending";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { isModerator, isAdmin } = await getModerationAccess(supabase);
  if (!isModerator) redirect("/dashboard");

  const flags = await listModerationQueue(supabase, status);
  const awaiting = isAdmin ? await listDealsAwaitingConfirmation(supabase) : [];

  const actionable = status === "pending" || status === "reviewing";

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <header style={S.header}>
          <div>
            <p style={S.kicker}>Trust &amp; Safety</p>
            <h1 style={S.title}>Moderation console</h1>
          </div>
          <div style={S.headerRight}>
            <span style={S.roleBadge}>{isAdmin ? "Admin" : "Moderator"}</span>
            <Link href="/dashboard" style={S.backLink}>
              Back to dashboard
            </Link>
          </div>
        </header>

        {sp.error ? <div style={{ ...S.banner, ...S.bannerErr }}>{sp.error}</div> : null}
        {sp.done ? (
          <div style={{ ...S.banner, ...S.bannerOk }}>Action applied: {sp.done.replace(/_/g, " ")}</div>
        ) : null}

        <nav style={S.tabs}>
          {STATUSES.map((st) => (
            <Link
              key={st}
              href={`/admin?status=${st}`}
              style={{ ...S.tab, ...(st === status ? S.tabActive : null) }}
            >
              {st}
            </Link>
          ))}
        </nav>

        <section>
          <h2 style={S.sectionTitle}>
            {status} flags <span style={S.count}>({flags.length})</span>
          </h2>

          {flags.length === 0 ? (
            <p style={S.empty}>No {status} flags. 🎉</p>
          ) : (
            <ul style={S.list}>
              {flags.map((f) => (
                <li key={f.id} style={S.card}>
                  <div style={S.cardTop}>
                    <span style={S.typeBadge}>{CONTENT_LABEL[f.content_type] ?? f.content_type}</span>
                    {f.reporter_user_id ? (
                      <span style={S.meta}>reported by {f.reporter_display_name ?? "member"}</span>
                    ) : (
                      <span style={{ ...S.meta, ...S.autoBadge }}>
                        auto-flag{f.auto_severity ? ` · ${f.auto_severity}` : ""}
                      </span>
                    )}
                    <span style={S.metaDim}>{fmt(f.created_at)}</span>
                    <span style={{ ...S.statusBadge, ...(statusStyle[f.status] ?? null) }}>{f.status}</span>
                  </div>

                  <blockquote style={S.snippet}>{f.snippet?.trim() || "(no text)"}</blockquote>

                  <div style={S.subMeta}>
                    <span>owner: {f.owner_display_name ?? f.content_owner_user_id}</span>
                    {f.reason ? <span>reason: {f.reason}</span> : null}
                  </div>

                  {actionable ? (
                    <form action={resolveFlagAction} style={S.actions}>
                      <input type="hidden" name="flagId" value={f.id} />
                      <input type="hidden" name="status" value={status} />
                      <input
                        type="text"
                        name="notes"
                        placeholder="notes (optional)"
                        style={S.notes}
                      />
                      <div style={S.btnRow}>
                        <button name="action" value="dismiss" style={{ ...S.btn, ...S.btnNeutral }}>
                          Dismiss
                        </button>
                        <button name="action" value="remove_content" style={{ ...S.btn, ...S.btnWarn }}>
                          Remove content
                        </button>
                        <button name="action" value="warn_user" style={{ ...S.btn, ...S.btnWarn }}>
                          Warn user
                        </button>
                        <button name="action" value="suspend_user" style={{ ...S.btn, ...S.btnDanger }}>
                          Suspend user
                        </button>
                        <button name="action" value="reinstate_user" style={{ ...S.btn, ...S.btnNeutral }}>
                          Reinstate user
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin ? (
          <section style={S.opsSection}>
            <h2 style={S.sectionTitle}>
              Deals awaiting confirmation <span style={S.count}>({awaiting.length})</span>
              <span style={S.adminOnly}>admin only</span>
            </h2>
            <p style={S.opsHint}>
              Fulfilled Proof Lab deals stuck &gt; 14 days with only one side confirmed.
            </p>
            {awaiting.length === 0 ? (
              <p style={S.empty}>Nothing stuck. 🎉</p>
            ) : (
              <ul style={S.list}>
                {awaiting.map((d) => (
                  <li key={d.deal_id} style={S.opsCard}>
                    <strong>{d.listing_title}</strong>
                    <span style={S.metaDim}>fulfilled {fmt(d.fulfilled_at)}</span>
                    <span style={S.meta}>
                      buyer {d.buyer_confirmed ? "✓" : "✗"} · seller {d.seller_confirmed ? "✓" : "✗"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

const statusStyle = {
  pending: { background: "#fef3c7", color: "#92400e" },
  reviewing: { background: "#dbeafe", color: "#1e40af" },
  resolved: { background: "#dcfce7", color: "#166534" },
  dismissed: { background: "#f1f5f9", color: "#475569" },
};

const S = {
  page: { minHeight: "100vh", background: "#0b1020", padding: "32px 16px", color: "#e5e7eb" },
  wrap: { maxWidth: 860, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  kicker: { margin: 0, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#818cf8" },
  title: { margin: "4px 0 0", fontSize: 28, fontWeight: 700, color: "#fff" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  roleBadge: { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#312e81", color: "#c7d2fe" },
  backLink: { fontSize: 13, color: "#94a3b8", textDecoration: "none" },
  banner: { padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14 },
  bannerErr: { background: "#7f1d1d", color: "#fecaca" },
  bannerOk: { background: "#14532d", color: "#bbf7d0" },
  tabs: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  tab: { fontSize: 13, padding: "6px 14px", borderRadius: 999, background: "#1e293b", color: "#cbd5e1", textDecoration: "none", textTransform: "capitalize" },
  tabActive: { background: "#4f46e5", color: "#fff" },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10 },
  count: { fontSize: 14, color: "#94a3b8", fontWeight: 500 },
  adminOnly: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#3730a3", color: "#c7d2fe", textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { color: "#94a3b8", fontSize: 15, padding: "16px 0" },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16 },
  cardTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  typeBadge: { fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: "#1e293b", color: "#e2e8f0" },
  meta: { fontSize: 13, color: "#cbd5e1" },
  metaDim: { fontSize: 12, color: "#64748b" },
  autoBadge: { color: "#fca5a5", fontWeight: 600 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, marginLeft: "auto", textTransform: "capitalize" },
  snippet: { margin: "0 0 10px", padding: "10px 12px", borderLeft: "3px solid #4f46e5", background: "#0b1220", borderRadius: 4, color: "#e5e7eb", fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  subMeta: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#94a3b8", marginBottom: 12 },
  actions: { borderTop: "1px solid #1f2937", paddingTop: 12 },
  notes: { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", fontSize: 13, marginBottom: 10 },
  btnRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  btn: { fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer" },
  btnNeutral: { background: "#334155", color: "#e2e8f0" },
  btnWarn: { background: "#b45309", color: "#fff" },
  btnDanger: { background: "#b91c1c", color: "#fff" },
  opsSection: { marginTop: 32, paddingTop: 24, borderTop: "1px solid #1f2937" },
  opsHint: { fontSize: 13, color: "#94a3b8", margin: "0 0 12px" },
  opsCard: { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" },
};
