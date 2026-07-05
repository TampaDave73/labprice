// Public "Suggest a Test" form (site footer) — pairs with the admin Analytics zero-result-search view
// as a second signal for which tests to add next; never auto-creates a Test row.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { notifyTestSuggestion } from '@/lib/services/notify-service';

const schema = z.object({
  testName: z.string().trim().min(2).max(200),
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
    const { testName, note, email } = parsed.data;
    await prisma.testSuggestion.create({
      data: {
        testName,
        note: note || null,
        email: email || null,
        userId: session?.user?.id ?? null,
      },
    });
    notifyTestSuggestion({ testName, note, email });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[POST /api/v1/suggestions/test]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
