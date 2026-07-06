import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { PROOF_LAB_TIMEFRAME_LABEL } from "@/lib/fivestarz/enums";

// Emails the seller when a member requests one of their Proof Lab deals. Runs
// with the service-role key so it can resolve the seller's auth email (never
// exposed to the browser). Best-effort: the client treats failures as non-fatal.
export async function POST(req) {
  try {
    const { dealRequestId } = await req.json();
    if (!dealRequestId) {
      return Response.json({ error: "dealRequestId is required." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return Response.json({ error: "Server not configured." }, { status: 500 });
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: request, error: reqError } = await admin
      .from("proof_lab_deal_requests")
      .select("id, seller_user_id, requester_user_id, requester_email, note, timeframe, listing:proof_lab_listings!listing_id(title)")
      .eq("id", dealRequestId)
      .single();

    if (reqError || !request) {
      return Response.json({ error: "Deal request not found." }, { status: 404 });
    }

    const [{ data: sellerAuth }, { data: requesterProfile }] = await Promise.all([
      admin.auth.admin.getUserById(request.seller_user_id),
      admin.from("user_profiles").select("display_name").eq("user_id", request.requester_user_id).maybeSingle(),
    ]);

    const sellerEmail = sellerAuth?.user?.email;
    if (!sellerEmail) {
      return Response.json({ error: "Seller email unavailable." }, { status: 404 });
    }

    const listingTitle = request.listing?.title || "your listing";
    const requesterName = requesterProfile?.display_name || "A member";
    const timeframeLabel = PROOF_LAB_TIMEFRAME_LABEL[request.timeframe] || request.timeframe;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "FiveStarz <noreply@bendersaas.ai>",
      to: [sellerEmail],
      subject: `New Proof Lab deal request — ${listingTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3D2B1F;">
          <div style="background: #3D2B1F; padding: 28px 32px; border-radius: 16px 16px 0 0;">
            <span style="font-size: 24px;">🧪</span>
            <span style="font-size: 20px; font-weight: 800; color: #fff; margin-left: 8px;">
              five<span style="color: #FF6B35;">starz</span> Proof Lab
            </span>
          </div>
          <div style="background: #fff; padding: 32px; border-radius: 0 0 16px 16px; border: 1.5px solid #F0E8E0;">
            <h2 style="margin: 0 0 20px; color: #3D2B1F;">New deal request</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px; width: 130px;">Listing</td><td style="padding: 8px 0; font-weight: 600;">${listingTitle}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px;">From</td><td style="padding: 8px 0; font-weight: 600;">${requesterName}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px;">Reply to</td><td style="padding: 8px 0; font-weight: 600;">${request.requester_email}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px;">Timeframe</td><td style="padding: 8px 0;">${timeframeLabel}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px; vertical-align: top;">Note</td><td style="padding: 8px 0;">${request.note || "—"}</td></tr>
            </table>
            <div style="margin-top: 24px; padding: 14px 18px; background: #FFF8F0; border-radius: 10px; font-size: 13px; color: #6B4226;">
              Reach out to <strong>${request.requester_email}</strong> to arrange the deal.
            </div>
          </div>
        </div>
      `,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Proof Lab notify-seller error:", err);
    return Response.json({ error: "Failed to notify seller." }, { status: 500 });
  }
}
