import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { search } from '@/lib/services/search-service';
import { logSearch } from '@/lib/services/analytics-service';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(25),
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

    const results = await search(parsed.data.q, parsed.data.limit);

    // Fire-and-forget analytics
    logSearch({ query: parsed.data.q, resultsCount: results.length });

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error('[GET /api/v1/search]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
