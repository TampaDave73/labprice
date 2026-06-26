import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTests, type TestSort } from '@/lib/services/test-service';

const querySchema = z.object({
  category: z.string().optional(),
  sort: z.enum(['name-asc', 'name-desc', 'price-asc', 'price-desc']).optional(),
  cursor: z.string().optional(),
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

    const result = await getTests({
      category: parsed.data.category,
      sort: parsed.data.sort as TestSort | undefined,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    console.error('[GET /api/v1/tests]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
