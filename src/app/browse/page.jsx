import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import BrowsePage from "@/components/fivestarz/BrowsePage";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Browse Members | FiveStarz",
  description: "Browse FiveStarz members and request a match to exchange honest feedback.",
};

export default async function BrowseMembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/browse");
  }

  return (
    <PageShell>
      <BrowsePage userId={user.id} />
    </PageShell>
  );
}

