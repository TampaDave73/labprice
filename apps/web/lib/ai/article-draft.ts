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
import { replaceEmDashes, stripRestatedOpening } from '../blog';

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
  // The prompt itself carries no em dashes: the model copies the punctuation of its instructions,
  // and an em-dash-heavy prompt produced em-dash-heavy drafts (18 in one article).
  'You draft clear explainer articles for LabTestCompare, a US self-pay blood-test price comparison',
  'site. The reader is a consumer with no medical background.',
  '',
  'SCOPE. Blood tests are this site’s subject, but an article does not have to be about one. Anything',
  'a reader of a lab-testing site would reasonably want explained is in scope: other diagnostics',
  '(semen analysis, DEXA, imaging), how the healthcare plumbing works (requisitions, patient service',
  'centers, insurance vs self-pay), how to read a result, what a marker means for a condition. If the',
  'topic connects to a test we sell, link it; if it does not, write the article anyway and leave',
  'relatedTests empty rather than forcing a connection that is not there.',
  '',
  'HARD LIMITS. A draft that breaks these is unusable:',
  '- No medical advice, no diagnosis, no dosing, no treatment guidance, and never tell a reader which',
  '  tests they personally should have or what their own result means.',
  '- Never write about drugs, peptides, steroids or supplements as substances: what to take, how',
  '  much, for how long, where to get it. If the source question came from a fitness or biohacking',
  '  community, the angle is what those people MEASURE and MONITOR, never the compounds themselves.',
  '- US English throughout: color not colour, liter not litre, center not centre, hemoglobin not',
  '  haemoglobin, gray not grey, "most expensive" not "dearest". The audience is American and the',
  '  test names on this site use US spellings.',
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
  '  blank line. Use "## " for a heading; every heading is a question a reader would actually type.',
  '  Under each heading, answer in the first sentence, then explain. Use "- " bullets, "1. " numbered',
  '  steps, tables (every row on its own line, first row the header, then a "| --- | --- |" separator',
  '  row), "> " for a callout, **bold** for emphasis, [text](/test/slug) to link a test page and',
  '  [title](/blog/slug) to link another article. Include at least one table or list.',
  '- THE BODY MUST NOT REPEAT THE EXCERPT. The page prints the excerpt directly above the body, so a',
  '  body that opens by restating, summarizing or rewording it shows the reader the same paragraph',
  '  twice. Open the body with a heading, a figure, or a paragraph that says something new.',
  '',
  'VOICE (drafts have read as machine-written; these rules are what fix that):',
  '- Never use an em dash (—) anywhere: not in the title, excerpt, body, faq, or source link titles.',
  '  Use a period, a comma, a colon or parentheses instead. Write number ranges with "to".',
  '- Do not open with a disclaimer or a "this article does not give medical advice" callout. The page',
  '  already carries a disclaimer. A caution belongs next to the specific claim it qualifies, once.',
  '- No stock phrasing: "it\'s worth noting", "plain-English", "below is", "in this article", "this',
  '  guide explains", "dive into", "navigate", "landscape", "crucial", "whether you\'re", "not just X',
  '  but Y", "the short answer". No sentence that only announces what the next sentence will say.',
  '- Prefer the concrete detail over the general statement, and vary sentence length.',
  '',
  'DIFFERENTIATION. Every draft so far has followed the same template (disclaimer callout, a "how does',
  'getting the test work" section, a "how are results read" section, a generic cost section, the same',
  'diagrams) and several covered each other\'s ground. Readers and search engines both read that as',
  'generated filler. So:',
  '- You are given the articles already on the site. Do not re-explain what they cover. One sentence',
  '  and a link to that article replaces a whole section.',
  '- Do not reuse their headings or their section order. Shape the article around this question: a',
  '  comparison can be mostly one table, a process can be numbered steps, a narrow "what is X" can be',
  '  short. No section exists only because another article had one.',
  '- A cost section is only worth writing if it says something specific to these tests; otherwise the',
  '  price chart can sit under the most relevant heading on its own.',
  '- VISUALS. A wall of text is a worse answer than an illustrated one, so every draft carries at',
  '  least one figure block on its own line:',
  '    * "[PRICE-CHART:slug,slug,slug]": a live bar chart of what those tests cost across every',
  '      ordering service. Include one whenever relatedTests has 2 or more entries, using the same',
  '      slugs. Prices are read at render time, so it can never be stale or wrong. Place it under the',
  '      heading where those tests are discussed. Omit it entirely for an article with no related',
  '      tests.',
  '    * "[FIG:name]": a hand-drawn diagram. ONLY these exist: draw-steps (the steps of getting a',
  '      test done), fasting-clock (what a 12-hour fast allows), lipid-breakdown (the four numbers on',
  '      a lipid panel), cmp-groups (the CMP 14 measurements by organ system),',
  '      selfpay-vs-insurance (the two routes to the same draw). Use one ONLY if the article\'s main',
  '      subject IS that diagram\'s subject. Mentioning a CMP in a list does not earn cmp-groups, and',
  '      an article that is not about the ordering process does not get draw-steps. Most drafts',
  '      should use none. Never invent a figure name.',
  '  End the body with a "## Sources" heading and 2-3 bullets linking authoritative references',
  '  (MedlinePlus, NIH, CDC) as [title](https://url). Only URLs you are confident exist.',
  '- faq: 4-6 "Q: ..." / "A: ..." line pairs. Each answer is 1-3 sentences and self-contained.',
  '- relatedTests: choose STRICTLY from the provided slug list, copied exactly. Empty array if none fit.',
].join('\n');

/**
 * @param question the harvested question, as asked
 * @param context  where it came from — helps the model judge the audience
 * @param availableTests slugs + names the model may reference and link; it invents none
 * @param guidance editor steering from /admin/questions, used on a redraft
 * @param existingArticles published posts, so the draft links to them instead of repeating them
 */
export async function generateArticleDraft(
  question: string,
  context: string,
  availableTests: { slug: string; name: string }[],
  guidance?: string | null,
  existingArticles: { slug: string; title: string; headings: string[] }[] = [],
): Promise<GeneratedArticle> {
  const client = new Anthropic();

  const existing = existingArticles.length
    ? `\n\nArticles already on the site (link to these; do not repeat their ground or copy their headings):\n` +
      existingArticles.map((a) => `/blog/${a.slug}: ${a.title}\n  headings: ${a.headings.join(' | ')}`).join('\n')
    : '';
  // Guidance used to be accepted here and then never sent, so "redraft with guidance" produced an
  // unguided draft. It goes last so it wins over anything above it.
  const steer = guidance?.trim() ? `\n\nEditor guidance for this draft (follow it):\n${guidance.trim()}` : '';

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
          availableTests.map((t) => `${t.slug}: ${t.name}`).join('\n') +
          existing +
          steer,
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

  // The prompt forbids both, but a draft is only as clean as what we enforce.
  parsed.title = replaceEmDashes(parsed.title);
  parsed.excerpt = replaceEmDashes(parsed.excerpt);
  parsed.faq = replaceEmDashes(parsed.faq);
  parsed.body = stripRestatedOpening(replaceEmDashes(parsed.body), parsed.excerpt);
  return parsed;
}
