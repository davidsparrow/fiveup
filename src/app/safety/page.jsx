import PageShell from "@/components/fivestarz/PageShell";
import SafetyPage from "@/components/fivestarz/SafetyPage";
import { MARKETING_ROBOTS } from "@/lib/fivestarz/site";

export const metadata = {
  title: "Trust & Safety | ProofSignals",
  description: "How ProofSignals keeps feedback honest, private, and free from manipulation. AI boundaries, privacy defaults, and moderation approach.",
  robots: MARKETING_ROBOTS,
};

export default function SafetyRoute() {
  return (
    <PageShell>
      <SafetyPage />
    </PageShell>
  );
}
