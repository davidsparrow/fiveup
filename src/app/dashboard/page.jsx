import PageShell from "@/components/fivestarz/PageShell";
import DashboardPage from "@/components/fivestarz/DashboardPage";

export const metadata = {
  title: "Dashboard | FiveStarz",
  description: "Manage your matches, assets, and feedback history on FiveStarz.",
};

export default function DashboardRoutePage() {
  return (
    <PageShell>
      <DashboardPage />
    </PageShell>
  );
}

