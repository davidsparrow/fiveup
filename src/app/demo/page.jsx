import DemoTourPage from "@/components/fivestarz/DemoTourPage";
import PageShell from "@/components/fivestarz/PageShell";
import { SITE_NAME } from "@/lib/fivestarz/site";

export const metadata = {
  title: `See ${SITE_NAME} in action — live demo | ${SITE_NAME}`,
  description:
    "A guided tour with sample members and live pages: post an asset, get matched, exchange honest human feedback, and publish public proof — no signup needed.",
  alternates: { canonical: "/demo" },
  robots: { index: true, follow: true },
};

export default function DemoRoute() {
  return (
    <PageShell>
      <DemoTourPage />
    </PageShell>
  );
}
