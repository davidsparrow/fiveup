import PageShell from "@/components/fivestarz/PageShell";
import SafetyPage from "@/components/fivestarz/SafetyPage";

export const metadata = {
  title: "Trust & Safety | ProofSignals",
  description: "How ProofSignals keeps feedback honest, private, and free from manipulation. AI boundaries, privacy defaults, and moderation approach.",
};

export default function SafetyRoute() {
  return (
    <PageShell>
      <SafetyPage />
    </PageShell>
  );
}
