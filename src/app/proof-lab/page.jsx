import { permanentRedirect } from "next/navigation";

// Phase A: the marketplace was renamed from "Proof Lab" to "Proof Market"
// (the old name collides with the Skool group). Old links keep working via
// this permanent redirect; tables, enums and RPCs keep their proof_lab_*
// names. The internal API route src/app/api/proof-lab/ is unchanged.
export default function ProofLabRedirect() {
  permanentRedirect("/proof-market");
}
