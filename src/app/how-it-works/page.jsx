import PageShell from "@/components/fivestarz/PageShell";
import HowPage from "@/components/fivestarz/HowPage";

export const metadata = {
  title: "How It Works | ProofSignals",
  description: "Learn how ProofSignals connects founders and marketers to exchange honest, human feedback — and optionally publish proof of it.",
};

export default function HowItWorksPage() {
  return (
    <PageShell>
      <HowPage />
    </PageShell>
  );
}

