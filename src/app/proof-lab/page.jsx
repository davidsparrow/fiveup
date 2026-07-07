import PageShell from "@/components/fivestarz/PageShell";
import ProofLabPage from "@/components/fivestarz/ProofLabPage";
import ProofLabTeaser from "@/components/fivestarz/ProofLabTeaser";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Proof Lab | FiveStarz",
  description: "Members-only deals on the best services — marketing, design, video, AI, ads, and more. Lock in founder-only pricing.",
};

export default async function ProofLabRoutePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Members get the full marketplace; anonymous visitors get the public teaser
  // (aggregate category counts + headline totals) instead of a login redirect.
  if (!user) {
    const [teaserRes, statsRes] = await Promise.all([
      supabase.rpc("list_public_proof_lab_teaser"),
      supabase.rpc("get_public_proof_lab_stats"),
    ]);
    return (
      <PageShell>
        <ProofLabTeaser categories={teaserRes.data ?? []} stats={statsRes.data?.[0] ?? null} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ProofLabPage userId={user.id} />
    </PageShell>
  );
}
