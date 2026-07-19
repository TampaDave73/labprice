// Admin email sending for the worker (scrape digests + failure alerts). Mirrors the web app's
// notify-service pattern (Resend + active-admin recipients) — duplicated because the worker can't
// import from apps/web. Without RESEND_API_KEY the email body is logged instead of sent, so local
// runs show exactly what production would email.
import { Resend } from 'resend';
import { prisma } from '@labprice/database';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'LabTestCompare <noreply@labtestcompare.com>';

async function adminEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null },
    select: { email: true },
  });
  return admins.map((a) => a.email);
}

/**
 * Send an email to all active admins; logs the text body when no RESEND_API_KEY is set.
 * Pass `html` for a rich body — `text` is always kept as the plain-text fallback part.
 */
export async function sendAdminEmail(subject: string, text: string, html?: string): Promise<void> {
  if (!resend) {
    console.log(`[report] (no RESEND_API_KEY — would email)\nSubject: ${subject}\n${text}`);
    return;
  }
  try {
    const to = await adminEmails();
    if (to.length === 0) {
      console.warn('[report] no active admins to email');
      return;
    }
    await resend.emails.send({ from: FROM, to, subject, text, ...(html ? { html } : {}) });
    console.log(`[report] emailed "${subject}" to ${to.length} admin(s)`);
  } catch (err) {
    console.error(`[report] "${subject}" email failed:`, err);
  }
}

// Immediate failure alerts are throttled to one per vendor per UTC day — a vendor with many
// per-URL offerings failing the same way shouldn't flood the inbox. In-memory is fine: the worker
// is a single long-lived process, and a restart at worst re-alerts once.
const alertedOn = new Map<string, string>();

/** Alert admins that a SCHEDULED scrape failed (manual runs show errors in the admin UI already). */
export async function sendScrapeFailureAlert(vendorId: string, vendorName: string, message: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (alertedOn.get(vendorId) === today) return;
  alertedOn.set(vendorId, today);

  // Error messages can be huge and noisy (Playwright prints ASCII-art banners). Cap the length and
  // show it in a <pre> so whatever remains at least lines up instead of soup-wrapping.
  const trimmed = message.length > 800 ? `${message.slice(0, 800)}\n… (truncated)` : message;
  const escaped = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const text = [
    `The overnight scrape for ${vendorName} failed.`,
    '',
    trimmed,
    '',
    `Retry from the vendor's admin page ("Scrape now"). Further failures for this vendor today are muted; Monday's digest has the full picture.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;border-top:4px solid #dc2626;padding:24px;">
      <h2 style="margin:0 0 4px;font-size:17px;color:#111827;">Scrape failed: ${vendorName}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">The overnight run couldn't get prices from this vendor.</p>
      <pre style="margin:0;padding:12px 14px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#374151;white-space:pre-wrap;word-break:break-word;overflow-x:auto;">${escaped}</pre>
      <p style="margin:16px 0 0;font-size:13px;color:#374151;">Retry from the vendor's admin page (<strong>Scrape now</strong>).</p>
      <p style="margin:12px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">Further failures for this vendor today are muted &middot; Monday's digest has the full picture.</p>
    </div>
  </div>
</body></html>`;

  await sendAdminEmail(`⚠ Scrape failed: ${vendorName}`, text, html);
}
