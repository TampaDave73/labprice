// Generates the patient-facing copy for existing tests, using the same Claude call the admin panel's
// "✨ Auto-fill" button uses (lib/ai/test-lookup.ts — one implementation, not a second prompt).
//
//   ANTHROPIC_API_KEY=... tsx apps/web/scripts/generate-test-content.ts [slug ...]
//
// WHY a file rather than writing straight to the database: this is health copy that goes on public
// pages, so it should be reviewable in a diff before it is published, and re-runnable without
// touching production. The output lands in apps/worker/content/test-content.json, which is committed
// and then applied by apps/worker/scripts/apply-test-content.ts.
//
// Deliberately narrow: it generates ONLY the five prose fields. Order codes, short names and
// categories on these tests are already set and verified — the generator is told the codes are known
// so the model returns null for them, and this script never writes them anyway.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateTestContent } from '../lib/ai/test-lookup';

const OUT = resolve(__dirname, '../../worker/content/test-content.json');
const API = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

// The 22 tests requested, by slug. Names come from the live catalog rather than being retyped here,
// so the model is prompted with exactly the name the page displays.
const SLUGS = [
  'cortisol-total',
  'c-reactive-protein-high-sensitivity',
  'estradiol-ultrasensitive-lc-ms-ms',
  'ferritin',
  'hemoglobin-a1c',
  'homocysteine',
  'igf-1-lc-ms',
  'insulin-fasting',
  'iron-tibc',
  'lipid-panel',
  'lipoprotein-a',
  'magnesium-rbc',
  'prolactin',
  'psa-total',
  't3-free',
  't4-free',
  'testosterone-free-calculation',
  'testosterone-total',
  'thyroid-peroxidase-antibodies',
  'uric-acid',
  'vitamin-b12',
  'vitamin-d-25-hydroxy',
];

interface Entry {
  slug: string;
  name: string;
  description: string;
  purpose: string;
  procedure: string;
  preparation: string;
  normalRange: string;
  generatedAt: string;
}

async function fetchTest(slug: string): Promise<{ name: string; questCode: string | null; labcorpCode: string | null }> {
  const res = await fetch(`${API}/api/v1/tests/${slug}`);
  if (!res.ok) throw new Error(`${slug}: ${res.status}`);
  const { data } = (await res.json()) as { data: { name: string; questCode: string | null; labcorpCode: string | null } };
  return { name: data.name, questCode: data.questCode, labcorpCode: data.labcorpCode };
}

async function main() {
  const only = process.argv.slice(2);
  const slugs = only.length ? SLUGS.filter((s) => only.includes(s)) : SLUGS;
  const out: Entry[] = [];

  for (const [i, slug] of slugs.entries()) {
    const test = await fetchTest(slug);
    process.stdout.write(`[${i + 1}/${slugs.length}] ${test.name} … `);

    // Codes are passed as known so the model returns null for them — we are not re-deriving codes.
    const gen = await generateTestContent(test.name, { questCode: test.questCode, labcorpCode: test.labcorpCode }, []);

    out.push({
      slug,
      name: test.name,
      description: gen.description.trim(),
      purpose: gen.purpose.trim(),
      procedure: gen.procedure.trim(),
      preparation: gen.preparation.trim(),
      normalRange: gen.normalRange.trim(),
      generatedAt: new Date().toISOString(),
    });
    console.log('ok');

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  }

  console.log(`\n${out.length} test(s) written to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
