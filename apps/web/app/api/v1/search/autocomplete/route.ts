import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { autocomplete } from '@/lib/services/search-service';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const results = await autocomplete(parsed.data.q, parsed.data.limit);
    return NextResponse.json({ data: results });
  } catch (err) {
    console.error('[GET /api/v1/search/autocomplete]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
