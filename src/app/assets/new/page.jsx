import PageShell from "@/components/fivestarz/PageShell";
import AssetPage from "@/components/fivestarz/AssetPage";

export const metadata = {
  title: "Add New Asset | FiveStarz",
  description: "Set up a new asset on FiveStarz and start collecting honest feedback from real members.",
};

export default function NewAssetPage() {
  return (
    <PageShell>
      <AssetPage />
    </PageShell>
  );
}

