import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import AssetPage from "@/components/fivestarz/AssetPage";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Add New Asset | FiveStarz",
  description: "Set up a new asset on FiveStarz and start collecting honest feedback from real members.",
};

export default async function NewAssetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/assets/new");
  }

  return (
    <PageShell>
      <AssetPage userId={user.id} />
    </PageShell>
  );
}

