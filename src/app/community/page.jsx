import PageShell from "@/components/fivestarz/PageShell";
import CommunityPage from "@/components/fivestarz/CommunityPage";

export const metadata = {
  title: "Community Rules | ProofSignals",
  description: "The ProofSignals community standard. Honest human feedback only — no review swaps, no engagement pods, no manipulation of any kind.",
};

export default function CommunityRoute() {
  return (
    <PageShell>
      <CommunityPage />
    </PageShell>
  );
}
