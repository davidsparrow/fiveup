import PageShell from "@/components/fivestarz/PageShell";
import BrowsePage from "@/components/fivestarz/BrowsePage";

export const metadata = {
  title: "Browse Members | FiveStarz",
  description: "Browse FiveStarz members and request a match to exchange honest feedback.",
};

export default function BrowseMembersPage() {
  return (
    <PageShell>
      <BrowsePage />
    </PageShell>
  );
}

