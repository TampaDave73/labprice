import { NextResponse } from 'next/server';
import { getPopularTests } from '@/lib/services/test-service';

export async function GET() {
  try {
    const data = await getPopularTests(6);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[GET /api/v1/tests/popular]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
