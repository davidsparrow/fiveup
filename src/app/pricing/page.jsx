import PageShell from "@/components/fivestarz/PageShell";
import PricingPage from "@/components/fivestarz/PricingPage";

export const metadata = {
  title: "Pricing | ProofSignals",
  description: "Simple, honest pricing for the ProofSignals founder feedback network. Start free, upgrade when you're ready. No fake reviews, no lock-ins.",
};

export default function PricingRoute() {
  return (
    <PageShell>
      <PricingPage />
    </PageShell>
  );
}
