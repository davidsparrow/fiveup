import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import DashboardPage from "@/components/fivestarz/DashboardPage";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard | FiveStarz",
  description: "Manage your matches, assets, and feedback history on FiveStarz.",
};

export default async function DashboardRoutePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <PageShell>
      <DashboardPage userId={user.id} />
    </PageShell>
  );
}

