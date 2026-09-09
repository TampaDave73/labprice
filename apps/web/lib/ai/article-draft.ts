// Turns an approved question from the research queue into a DRAFT article (Claude).
//
// WHY a draft and never a published post: this is health-adjacent content on a commercial site, and
// publishing generated articles on a schedule is the pattern search engines treat as scaled content
// abuse. A human reads and publishes from /admin/blog. Nothing here writes `isPublished: true`.
//
// The prompt encodes the same editorial rules the hand-written launch articles follow, because a
// draft that ignores them just becomes rework: answer-first, question-shaped headings, a table or a
// list, a real FAQ, and no medical advice.
import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedArticle {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  faq: string;
  relatedTests: string[];
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    body: { type: 'string' },
    faq: { type: 'string' },
    relatedTests: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'slug', 'excerpt', 'body', 'faq', 'relatedTests'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'You draft plain-English explainer articles for LabTestCompare, a US self-pay blood-test price',
  'comparison site. The reader is a consumer with no medical background.',
  '',
  'HARD LIMITS — a draft that breaks these is unusable:',
  '- No medical advice, no diagnosis, no dosing, no treatment guidance, and never tell a reader which',
  '  tests they personally should have or what their own result means.',
  '- Never write about drugs, peptides, steroids or supplements as substances. If the source question',
  '  came from a fitness or biohacking community, the angle is always the MARKERS AND PANELS people in',
  '  that community track, never the compounds themselves.',
  '- Reference ranges must be described as varying by laboratory, sex and age.',
  '- Invent nothing. If you are unsure of a fact, leave it out rather than approximating it.',
  '- Never write a price or a dollar figure into the body. Prices are injected at render time.',
  '',
  'STRUCTURE (this is what makes the article findable):',
  '- title: the question, phrased the way a person would type it. Under 60 characters where possible.',
  '- slug: lowercase words separated by hyphens, derived from the title.',
  '- excerpt: 2-4 sentences that answer the question completely on their own. This doubles as the meta',
  '  description and as the article opening, so it must stand alone rather than tease.',
  '- body: markup, NOT HTML and NOT markdown headings other than those listed. Blocks separated by a',
  '  blank line. Use "## " for a heading — every heading is a question a reader would actually type.',
  '  Under each heading, answer in the first sentence, then explain. Use "- " bullets, "1. " numbered',
  '  steps, "| a | b |" tables (first row is the header), "> " for a callout, **bold** for emphasis,',
  '  and [text](/test/slug) to link a test page. Include at least one table or list.',
  '  End the body with a "## Sources" heading and 2-3 bullets linking authoritative references',
  '  (MedlinePlus, NIH, CDC) as [title](https://url) — only URLs you are confident exist.',
  '- faq: 4-6 "Q: ..." / "A: ..." line pairs. Each answer is 1-3 sentences and self-contained.',
  '- relatedTests: choose STRICTLY from the provided slug list, copied exactly. Empty array if none fit.',
].join('\n');

/**
 * @param question the harvested question, as asked
 * @param context  where it came from — helps the model judge the audience
 * @param availableTests slugs + names the model may reference and link; it invents none
 */
export async function generateArticleDraft(
  question: string,
  context: string,
  availableTests: { slug: string; name: string }[],
): Promise<GeneratedArticle> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA }, effort: 'high' },
    messages: [
      {
        role: 'user',
        content:
          `Draft an article answering this question, which people are asking in ${context}:\n\n"${question}"\n\n` +
          `Tests you may link and list in relatedTests (slug — name):\n` +
          availableTests.map((t) => `${t.slug} — ${t.name}`).join('\n'),
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No structured output returned');
  const parsed = JSON.parse(text.text) as GeneratedArticle;

  // The model picks from the list, but never trust it to have stayed inside it.
  const allowed = new Set(availableTests.map((t) => t.slug));
  parsed.relatedTests = (parsed.relatedTests ?? []).filter((s) => allowed.has(s));
  parsed.slug = parsed.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
  return parsed;
}
