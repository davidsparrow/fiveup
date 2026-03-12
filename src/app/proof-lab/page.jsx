import PageShell from "@/components/fivestarz/PageShell";
import ProofLabPage from "@/components/fivestarz/ProofLabPage";

export const metadata = {
  title: "Proof Lab | FiveStarz",
  description: "Members-only deals on the best services — marketing, design, video, AI, ads, and more. Lock in founder-only pricing.",
};

export default function ProofLabRoutePage() {
  return (
    <PageShell>
      <ProofLabPage />
    </PageShell>
  );
}

