// POST /api/v1/admin/tests/lookup — auto-fill helper for the Add/Edit Test screen.
//
// Given a test name, returns everything we can pre-fill for admin review BEFORE saving: short name,
// slug, best-fitting existing categories, patient-facing content, and Quest/LabCorp codes. Codes come
// from our vendor catalogs first (authoritative, non-hallucinated), Claude only for gaps. Content /
// short name / category picks are Claude-generated. Slug is derived deterministically from the name.
// Degrades gracefully when no ANTHROPIC_API_KEY is set (returns catalog codes + slug + a note).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
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

/** Deterministic slug from a test name (lowercase, hyphenated) — mirrors the site's slug convention. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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

  const slug = slugify(name);

  // 1) Codes from catalogs (authoritative).
  const catalog = await lookupCodesFromCatalogs(name, { fetchHtml }).catch(() => null);
  let questCode = catalog?.questCode ?? null;
  let labcorpCode = catalog?.labcorpCode ?? null;
  const sources: Record<string, string> = {};
  if (catalog?.questCode) sources.questCode = catalog.source;
  if (catalog?.labcorpCode) sources.labcorpCode = catalog.source;

  const notes: string[] = [];
  if (catalog) notes.push(`Matched "${catalog.matchedName}" in the ${catalog.source} catalog.`);

  // Existing categories the model may pick from (it won't invent new ones).
  const categories = await prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });

  // 2) Short name / content / category picks / code fallback from Claude, when configured.
  let shortName: string | null = null;
  let categoryIds: string[] = [];
  let content: {
    description: string; purpose: string; procedure: string; preparation: string; normalRange: string;
  } | null = null;

  if (hasAnthropicKey()) {
    try {
      const ai = await generateTestContent(name, { questCode, labcorpCode }, categories.map((c) => c.name));
      shortName = ai.shortName?.trim() || null;
      content = {
        description: ai.description,
        purpose: ai.purpose,
        procedure: ai.procedure,
        preparation: ai.preparation,
        normalRange: ai.normalRange,
      };
      if (!questCode && ai.questCode) { questCode = ai.questCode; sources.questCode = 'ai'; }
      if (!labcorpCode && ai.labcorpCode) { labcorpCode = ai.labcorpCode; sources.labcorpCode = 'ai'; }
      // Map the model's category names back to our IDs (case-insensitive; ignore anything off-list).
      const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
      categoryIds = ai.categoryNames.map((n) => byName.get(n.trim().toLowerCase())).filter((v): v is string => Boolean(v));
    } catch (e) {
      console.error('[tests/lookup] AI generation failed', e);
      notes.push('AI content generation failed — codes only. Check server logs / ANTHROPIC_API_KEY.');
    }
  } else {
    notes.push('No ANTHROPIC_API_KEY configured — returning catalog codes + slug only (no generated content).');
  }

  if (sources.questCode === 'ai' || sources.labcorpCode === 'ai') {
    notes.push('One or more codes were AI-suggested — verify against the lab before saving.');
  }
  if (!questCode && !labcorpCode && !content) {
    notes.push('No catalog match and no content generated. Enter details manually.');
  }

  return NextResponse.json({
    data: { shortName, slug, categoryIds, questCode, labcorpCode, ...(content ?? {}), sources, notes },
  });
}
