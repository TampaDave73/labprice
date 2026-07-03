// POST /api/v1/admin/tests/lookup — auto-fill helper for the Add/Edit Test screen.
//
// Given a test name, returns Quest/LabCorp order codes + patient-facing content for admin review
// BEFORE saving. Codes: our vendor catalogs first (authoritative, non-hallucinated), Claude only for
// gaps the catalog couldn't fill. Content: always Claude-generated. Degrades gracefully when no
// ANTHROPIC_API_KEY is set (returns catalog codes + a note, no generated content).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { lookupCodesFromCatalogs } from '@labprice/scrapers/src/catalog/code-lookup';
import { generateTestContent, hasAnthropicKey } from '@/lib/ai/test-lookup';

// Codes lookup crawls a live catalog + calls the model; give it room.
export const maxDuration = 60;

const fetchHtml = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { 'User-Agent': 'LabTestCompare/1.0 (+admin lookup)' } });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.text();
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'A test name is required.' } }, { status: 400 });
  }

  // 1) Codes from catalogs (authoritative).
  const catalog = await lookupCodesFromCatalogs(name, { fetchHtml }).catch(() => null);
  let questCode = catalog?.questCode ?? null;
  let labcorpCode = catalog?.labcorpCode ?? null;
  const sources: Record<string, string> = {};
  if (catalog?.questCode) sources.questCode = catalog.source;
  if (catalog?.labcorpCode) sources.labcorpCode = catalog.source;

  const notes: string[] = [];
  if (catalog) notes.push(`Matched "${catalog.matchedName}" in the ${catalog.source} catalog.`);

  // 2) Content (+ code fallback) from Claude, when configured.
  let content: {
    description: string; purpose: string; procedure: string; preparation: string; normalRange: string;
  } | null = null;

  if (hasAnthropicKey()) {
    try {
      const ai = await generateTestContent(name, { questCode, labcorpCode });
      content = {
        description: ai.description,
        purpose: ai.purpose,
        procedure: ai.procedure,
        preparation: ai.preparation,
        normalRange: ai.normalRange,
      };
      if (!questCode && ai.questCode) { questCode = ai.questCode; sources.questCode = 'ai'; }
      if (!labcorpCode && ai.labcorpCode) { labcorpCode = ai.labcorpCode; sources.labcorpCode = 'ai'; }
    } catch (e) {
      console.error('[tests/lookup] AI generation failed', e);
      notes.push('AI content generation failed — codes only. Check server logs / ANTHROPIC_API_KEY.');
    }
  } else {
    notes.push('No ANTHROPIC_API_KEY configured — returning catalog codes only (no generated content).');
  }

  if (sources.questCode === 'ai' || sources.labcorpCode === 'ai') {
    notes.push('One or more codes were AI-suggested — verify against the lab before saving.');
  }
  if (!questCode && !labcorpCode && !content) {
    notes.push('No match found in catalogs and no content generated. Enter details manually.');
  }

  return NextResponse.json({
    data: { questCode, labcorpCode, ...(content ?? {}), sources, notes },
  });
}
