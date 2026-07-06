import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import ProofLabPage from "@/components/fivestarz/ProofLabPage";
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

  if (!user) {
    redirect("/login?next=/proof-lab");
  }

  return (
    <PageShell>
      <ProofLabPage userId={user.id} />
    </PageShell>
  );
}
