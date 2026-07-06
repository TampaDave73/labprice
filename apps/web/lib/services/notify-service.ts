// Admin email alerts for user-submitted content (currently: footer suggestion forms). Fire-and-forget
// like analytics-service — a failed/unconfigured email must never break the submitter's request.
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

// Shared send path: no-ops without a RESEND_API_KEY or any active admin; swallows (but logs) send
// failures. `lines` may contain nulls for optional fields — they're filtered here so callers can
// build the body declaratively.
async function sendAdminAlert(subject: string, lines: (string | null)[]): Promise<void> {
  if (!resend) return;
  try {
    const to = await adminEmails();
    if (to.length === 0) return;
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      text: [...lines, '', 'Review at /admin/suggestions'].filter((l): l is string => l !== null).join('\n'),
    });
  } catch (err) {
    console.error(`[notify] "${subject}" email failed:`, err);
  }
}

export async function notifyVendorSuggestion(params: {
  vendorName: string;
  vendorUrl?: string | null;
  note?: string | null;
  email?: string | null;
}) {
  await sendAdminAlert(`New vendor suggestion: ${params.vendorName}`, [
    `Vendor: ${params.vendorName}`,
    params.vendorUrl ? `Website: ${params.vendorUrl}` : null,
    params.note ? `Note: ${params.note}` : null,
    params.email ? `Submitted by: ${params.email}` : 'Submitted anonymously',
  ]);
}

export async function notifyTestSuggestion(params: {
  testName: string;
  note?: string | null;
  email?: string | null;
}) {
  await sendAdminAlert(`New test suggestion: ${params.testName}`, [
    `Test: ${params.testName}`,
    params.note ? `Note: ${params.note}` : null,
    params.email ? `Submitted by: ${params.email}` : 'Submitted anonymously',
  ]);
}

export async function notifyResultErrorReport(params: {
  testName: string;
  vendorName?: string | null;
  message: string;
  email?: string | null;
}) {
  await sendAdminAlert(`Result error report: ${params.testName}`, [
    `Test: ${params.testName}`,
    params.vendorName ? `Vendor: ${params.vendorName}` : 'Vendor: (general — not vendor-specific)',
    `Message: ${params.message}`,
    params.email ? `Submitted by: ${params.email}` : 'Submitted anonymously',
  ]);
}
