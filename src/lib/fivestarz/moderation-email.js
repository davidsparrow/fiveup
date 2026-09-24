import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Member-facing labels for the moderated content types (7a enum values).
const CONTENT_LABELS = {
  profile_bio: "profile bio",
  feedback: "feedback submission",
  asset: "asset",
  proof_lab_listing: "Proof Market listing",
  deal_note: "deal note",
  proof_lab_review: "Proof Market review",
};

// Subject + body copy per moderation action. Returns null for actions the
// member should not be notified about (dismiss — the member never learns a
// report existed). Moderator notes are deliberately NOT included: they are an
// internal audit trail, not member-facing copy.
export function composeModerationEmail({ action, contentType }) {
  const label = CONTENT_LABELS[contentType] ?? "content";
  switch (action) {
    case "warn_user":
      return {
        subject: "A warning about your account",
        heading: "Account warning",
        body: "A moderator reviewed recent activity on your account and issued a warning for a community-guidelines violation. Your account remains fully active. Repeated violations can lead to suspension.",
      };
    case "suspend_user":
      return {
        subject: "Your account has been suspended",
        heading: "Account suspended",
        body: "A moderator has suspended your account for a community-guidelines violation. You can still sign in and view your data, but posting, matching, and other write actions are disabled. If you believe this is a mistake, reply to this email.",
      };
    case "reinstate_user":
      return {
        subject: "Your account has been reinstated",
        heading: "Account reinstated",
        body: "Your account is active again — posting, matching, and all other actions are re-enabled. Thanks for being part of the community.",
      };
    case "remove_content":
      return {
        subject: `Your ${label} was removed`,
        heading: "Content removed",
        body: `A moderator removed one of your ${label === "content" ? "posts" : `${label}s`} for a community-guidelines violation. It is no longer visible to other members. If you believe this is a mistake, reply to this email.`,
      };
    case "restore_content":
      return {
        subject: `Your ${label} was restored`,
        heading: "Content restored",
        body: `A moderator restored your ${label}. It is visible to other members again.`,
      };
    default:
      return null; // dismiss and anything unknown: no member notification
  }
}

export function renderModerationEmailHtml({ heading, body }) {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3D2B1F;">
      <div style="background: #3D2B1F; padding: 28px 32px; border-radius: 16px 16px 0 0;">
        <span style="font-size: 20px; font-weight: 800; color: #fff;">
          five<span style="color: #FF6B35;">starz</span>
        </span>
      </div>
      <div style="background: #fff; padding: 32px; border-radius: 0 0 16px 16px; border: 1.5px solid #F0E8E0;">
        <h2 style="margin: 0 0 16px; color: #3D2B1F;">${heading}</h2>
        <p style="margin: 0; font-size: 15px; line-height: 1.65; color: #6B4226;">${body}</p>
        <div style="margin-top: 24px; padding: 14px 18px; background: #FFF8F0; border-radius: 10px; font-size: 13px; color: #6B4226;">
          Questions about this decision? Reply to this email and a moderator will take a look.
        </div>
      </div>
    </div>
  `;
}

// Email the member affected by a resolve_flag action. Best-effort: never
// throws — a failed or skipped email must not block the moderation action.
// Skips quietly when the action carries no notification (dismiss), the email
// service is not configured, or the target has no auth email.
export async function sendModerationOutcomeEmail({ flagId, action }) {
  try {
    // Short-circuit non-notifiable actions (dismiss) before any network work.
    // The placeholder contentType only affects wording, not whether an email
    // exists for the action.
    if (!composeModerationEmail({ action, contentType: "asset" })) return false;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!url || !serviceKey || !resendKey) return false;

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: flag } = await admin
      .from("moderation_flags")
      .select("content_type, content_owner_user_id")
      .eq("id", flagId)
      .single();
    if (!flag?.content_owner_user_id) return false;

    const email = composeModerationEmail({ action, contentType: flag.content_type });
    if (!email) return false;

    const { data: targetAuth } = await admin.auth.admin.getUserById(flag.content_owner_user_id);
    const to = targetAuth?.user?.email;
    if (!to) return false;

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "ProofSignals <noreply@notify.indieops.co>",
      to: [to],
      subject: email.subject,
      html: renderModerationEmailHtml(email),
    });
    return true;
  } catch (err) {
    console.error("moderation outcome email failed:", err);
    return false;
  }
}
