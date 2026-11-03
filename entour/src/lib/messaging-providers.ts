/**
 * Envoi d'e-mails (Resend) et de SMS.
 * Sans configuration, les messages sont écrits dans la console du serveur — uniquement hors production.
 */
import "server-only";

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY manquante : e-mail non envoyé à", to);
      return { delivered: false };
    }
    console.info(`\n[email:dev] À: ${to}\n[email:dev] Objet: ${subject}\n${text}\n`);
    return { delivered: false, devLogged: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "ENTOUR <bonjour@entour.fr>", to, subject, html, text }),
  });
  if (!res.ok) {
    console.error("[email] échec Resend", res.status, await res.text().catch(() => ""));
    return { delivered: false };
  }
  return { delivered: true };
}

export async function sendSms(to: string, body: string) {
  const provider = process.env.SMS_PROVIDER ?? "console";
  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Aucun fournisseur SMS configuré en production");
      return { delivered: false };
    }
    console.info(`[sms:dev] À: ${to} — ${body}`);
    return { delivered: false, devLogged: true };
  }
  // Point d'intégration : ajoutez ici votre fournisseur (Twilio, Vonage, OVH SMS, Brevo…).
  console.error(`[sms] Fournisseur « ${provider} » non implémenté`);
  return { delivered: false };
}

export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F5F0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1A2E">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:800;font-size:22px;letter-spacing:-0.02em;color:#3B2FD9;margin-bottom:24px">entour</div>
    <div style="background:#fff;border-radius:20px;padding:28px;border:1px solid #ECE8DF">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      <div style="font-size:15px;line-height:1.6;color:#45435A">${bodyHtml}</div>
      ${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#3B2FD9;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${cta.label}</a>` : ""}
    </div>
    <p style="font-size:12px;color:#8A8799;margin-top:20px">Vous recevez cet e-mail car vous avez un compte ENTOUR.</p>
  </div></body></html>`;
}
