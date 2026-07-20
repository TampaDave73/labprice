import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logPageView, logSearch } from '@/lib/services/analytics-service';
import { getClientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pageview'),
    data: z.object({
      path: z.string().max(500),
      testId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('search'),
    data: z.object({
      query: z.string().max(200),
      resultsCount: z.number().int().min(0),
    }),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    // Generous floodgate: pageview/search fire on real navigation + debounced typing, so the ceiling
    // is high — it exists to stop a script from filling SearchLog/PageView, not to limit real users.
    const rl = rateLimit(getClientIp(req), 'analytics', { limit: 120, windowMs: 60 * 1000 });
    if (!rl.ok) {
      const { body: errBody, retryAfterSec } = tooManyRequests(rl.retryAfterSec);
      return NextResponse.json(errBody, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }

    const body = await req.json();
    const parsed = eventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid event payload', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const event = parsed.data;
    // Session id comes from the `sid` cookie (set by middleware.ts) rather than a client-supplied
    // value — a plain cookie is sent automatically on every request, including the affiliate-click
    // redirect (a top-level navigation, not a fetch this page's JS could attach an id to).
    const sessionId = req.cookies.get('sid')?.value;

    if (event.type === 'pageview') {
      logPageView({ ...event.data, sessionId });
    } else {
      logSearch({ ...event.data, sessionId });
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[POST /api/v1/analytics/event]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
