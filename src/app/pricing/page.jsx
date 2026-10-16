import PageShell from "@/components/fivestarz/PageShell";
import PricingPage from "@/components/fivestarz/PricingPage";
import { getPublicPlanCaps } from "@/lib/fivestarz/data";
import { PLAN_TIERS, capsForPlan, getSkoolUrls, indexCaps } from "@/lib/fivestarz/plans";
import { MARKETING_ROBOTS } from "@/lib/fivestarz/site";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Join the Proof Lab | ProofSignals",
  description:
    "Two Skool groups, one record. The free IndieOps Proof Lab for honest peer feedback, and the IndieOps Incubator with the caps lifted plus all-access to every IndieOps software.",
  robots: MARKETING_ROBOTS,
};

// Caps are read here, server-side and anonymously, so the cards render with
// the numbers the database actually enforces rather than copy that can drift.
// public_plan_caps() is anon-readable by design (a whitelist over
// plan_feature_gates) and getPublicPlanCaps returns [] rather than throwing,
// so a database blip costs the caps table and not the page.
export default async function PricingRoute() {
  const supabase = await createClient();
  const byPlan = indexCaps(await getPublicPlanCaps(supabase));

  const capsByPlan = Object.fromEntries(
    PLAN_TIERS.map((tier) => [tier.planCode, capsForPlan(byPlan, tier.planCode)]),
  );

  return (
    <PageShell>
      <PricingPage capsByPlan={capsByPlan} skoolUrls={getSkoolUrls()} />
    </PageShell>
  );
}
