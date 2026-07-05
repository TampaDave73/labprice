// Public "Suggest a Vendor" form (site footer) — captures a lead for the admin to manually vet and
// onboard; never auto-creates a Vendor row.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { notifyVendorSuggestion } from '@/lib/services/notify-service';

const schema = z.object({
  vendorName: z.string().trim().min(2).max(200),
  // People type "walkinlab.com", not "https://walkinlab.com" — prepend a protocol before the URL
  // check instead of bouncing the whole submission.
  vendorUrl: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .pipe(z.string().url().or(z.literal('')))
    .optional(),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  try {
    // Malformed JSON is a client error (400 via safeParse), not a 500.
    const body: unknown = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid submission', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const session = await auth();
    const { vendorName, vendorUrl, note, email } = parsed.data;
    await prisma.vendorSuggestion.create({
      data: {
        vendorName,
        vendorUrl: vendorUrl || null,
        note: note || null,
        email: email || null,
        userId: session?.user?.id ?? null,
      },
    });
    notifyVendorSuggestion({ vendorName, vendorUrl, note, email });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[POST /api/v1/suggestions/vendor]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
