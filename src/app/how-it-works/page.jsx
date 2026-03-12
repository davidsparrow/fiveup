import PageShell from "@/components/fivestarz/PageShell";
import HowPage from "@/components/fivestarz/HowPage";

export const metadata = {
  title: "How It Works | FiveStarz",
  description: "Learn how FiveStarz connects founders and solopreneurs to exchange honest, ethical feedback and build real social proof.",
};

export default function HowItWorksPage() {
  return (
    <PageShell>
      <HowPage />
    </PageShell>
  );
}

