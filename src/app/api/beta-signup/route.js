import { Resend } from "resend";
export async function POST(req) {
  try {
    const { name, email, business, url, goal } = await req.json();

    if (!name || !email) {
      return Response.json({ error: "Name and email are required." }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({

      from: "FiveStarz <noreply@bendersaas.ai>",
      to: ["spasta+fivestarz@gmail.com"],
      subject: `New FiveStarz Beta Request — ${name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3D2B1F;">
          <div style="background: #3D2B1F; padding: 28px 32px; border-radius: 16px 16px 0 0;">
            <span style="font-size: 24px;">⭐</span>
            <span style="font-size: 20px; font-weight: 800; color: #fff; margin-left: 8px;">
              five<span style="color: #FF6B35;">starz</span>
            </span>
          </div>
          <div style="background: #fff; padding: 32px; border-radius: 0 0 16px 16px; border: 1.5px solid #F0E8E0;">
            <h2 style="margin: 0 0 20px; color: #3D2B1F;">New Beta Access Request</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px; width: 130px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${name}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px;">Email</td><td style="padding: 8px 0; font-weight: 600;">${email}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px;">Business</td><td style="padding: 8px 0;">${business || "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px;">Website</td><td style="padding: 8px 0;">${url || "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #A0644A; font-size: 13px; vertical-align: top;">Goal</td><td style="padding: 8px 0;">${goal || "—"}</td></tr>
            </table>
            <div style="margin-top: 24px; padding: 14px 18px; background: #FFF8F0; border-radius: 10px; font-size: 13px; color: #6B4226;">
              Submitted on ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}
            </div>
          </div>
        </div>
      `,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Resend error:", err);
    return Response.json({ error: "Failed to send email." }, { status: 500 });
  }
}
