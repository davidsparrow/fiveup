import PageShell from "@/components/fivestarz/PageShell";
import PricingPage from "@/components/fivestarz/PricingPage";
import { MARKETING_ROBOTS } from "@/lib/fivestarz/site";

export const metadata = {
  title: "Pricing | ProofSignals",
  description: "Simple, honest pricing for the ProofSignals founder feedback network. Start free, upgrade when you're ready. No fake reviews, no lock-ins.",
  robots: MARKETING_ROBOTS,
};

export default function PricingRoute() {
  return (
    <PageShell>
      <PricingPage />
    </PageShell>
  );
}
