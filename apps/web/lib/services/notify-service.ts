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

export async function notifyVendorSuggestion(params: {
  vendorName: string;
  vendorUrl?: string | null;
  note?: string | null;
  email?: string | null;
}) {
  if (!resend) return;
  try {
    const to = await adminEmails();
    if (to.length === 0) return;
    await resend.emails.send({
      from: FROM,
      to,
      subject: `New vendor suggestion: ${params.vendorName}`,
      text: [
        `Vendor: ${params.vendorName}`,
        params.vendorUrl ? `Website: ${params.vendorUrl}` : null,
        params.note ? `Note: ${params.note}` : null,
        params.email ? `Submitted by: ${params.email}` : 'Submitted anonymously',
        '',
        'Review at /admin/suggestions',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  } catch (err) {
    console.error('[notify] vendor suggestion email failed:', err);
  }
}

export async function notifyTestSuggestion(params: {
  testName: string;
  note?: string | null;
  email?: string | null;
}) {
  if (!resend) return;
  try {
    const to = await adminEmails();
    if (to.length === 0) return;
    await resend.emails.send({
      from: FROM,
      to,
      subject: `New test suggestion: ${params.testName}`,
      text: [
        `Test: ${params.testName}`,
        params.note ? `Note: ${params.note}` : null,
        params.email ? `Submitted by: ${params.email}` : 'Submitted anonymously',
        '',
        'Review at /admin/suggestions',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  } catch (err) {
    console.error('[notify] test suggestion email failed:', err);
  }
}
