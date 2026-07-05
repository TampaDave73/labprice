import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { autocomplete } from '@/lib/services/search-service';
import { logSearch } from '@/lib/services/analytics-service';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  sessionId: z.string().max(100).optional(),
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

    // This is the search endpoint the site's actual SearchBar calls (the OTHER /api/v1/search route
    // logs, but nothing in the UI calls it) — log here so "what are people searching for" reflects real
    // usage. Debounced 300ms per keystroke client-side, so this can include partial-word prefixes; the
    // admin analytics view leans on the zero-result slice, which stays meaningful either way.
    logSearch({ query: parsed.data.q, resultsCount: results.length, sessionId: parsed.data.sessionId });

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error('[GET /api/v1/search/autocomplete]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
