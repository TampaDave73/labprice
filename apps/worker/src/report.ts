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
  await sendAdminEmail(
    `⚠ Scrape failed: ${vendorName}`,
    [
      `The scheduled scrape for ${vendorName} failed.`,
      '',
      `Error: ${message}`,
      '',
      `Details: /admin/vendors — open the vendor and check its scrape history, or run "Scrape now" to retry.`,
      `(Further failures for this vendor today are muted; the weekly digest has the full picture.)`,
    ].join('\n'),
  );
}
