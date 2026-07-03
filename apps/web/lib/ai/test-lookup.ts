// AI-assisted test metadata generation (Claude).
//
// WHY: when an admin adds a lab test, we auto-fill the metadata for review — a short name, the
// patient-facing copy (description / purpose / how it's performed / how to prepare / normal ranges),
// the best-fitting existing categories, and (as a *fallback only*, when our vendor catalogs missed
// them) the Quest/LabCorp order codes. The catalog lookup (see @labprice/scrapers code-lookup) stays
// the authoritative code source and always wins; AI-supplied codes are flagged for admin verification.
//
// Uses the official Anthropic SDK. Reads ANTHROPIC_API_KEY from the environment; when it's absent the
// caller degrades gracefully (codes-from-catalog only, no generated content).
import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedTestContent {
  shortName: string; // concise common name / abbreviation, e.g. "HbA1c", "CMP"
  description: string;
  purpose: string;
  procedure: string; // "How It's Performed"
  preparation: string; // "How To Prepare"
  normalRange: string; // "Normal Ranges"
  categoryNames: string[]; // chosen strictly from the provided existing-category list
  questCode: string | null; // only when not already supplied by the catalog
  labcorpCode: string | null;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// JSON schema the model is constrained to (structured outputs). Codes are nullable — the model must
// emit null rather than guess. additionalProperties:false + all-required is required by the API.
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    shortName: { type: 'string' },
    description: { type: 'string' },
    purpose: { type: 'string' },
    procedure: { type: 'string' },
    preparation: { type: 'string' },
    normalRange: { type: 'string' },
    categoryNames: { type: 'array', items: { type: 'string' } },
    questCode: { type: ['string', 'null'] },
    labcorpCode: { type: ['string', 'null'] },
  },
  required: ['shortName', 'description', 'purpose', 'procedure', 'preparation', 'normalRange', 'categoryNames', 'questCode', 'labcorpCode'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'You write accurate, patient-facing reference copy for a blood-test price-comparison site (LabTestCompare).',
  'Audience: US consumers with no medical background. Be factual, neutral, and concise; no marketing language,',
  'no medical advice, no dosing, no diagnosis. Write in plain sentences (no markdown, no bullet symbols).',
  'If a field genuinely does not apply to this test, give a short honest note rather than inventing specifics.',
  'For normal ranges, state that reference ranges vary by lab, sex, and age, and give typical adult ranges only',
  'when they are well-established and standard.',
  'shortName: a concise common name or abbreviation for the test (e.g. "HbA1c", "CMP", "Vitamin D");',
  'if none is standard, use a short form of the full name.',
  'categoryNames: choose the 1-2 best-fitting categories STRICTLY from the provided list, copied exactly;',
  'if none fit, return an empty array — never invent a category.',
  'Order codes: provide the standard Quest / LabCorp order code for THIS specific test when you know it.',
  'Return null for a code only when you are genuinely unsure or the test name is too ambiguous to pin one down.',
  'A downstream reviewer verifies AI-supplied codes, so prefer a correct standard code over null, but never guess wildly.',
].join(' ');

/**
 * Generate metadata for a test: short name, five content fields, category picks, and code fallbacks.
 * @param knownCodes codes already resolved from catalogs — passed so the model skips them (returns null).
 * @param availableCategories existing category names the model may choose from (it won't invent new ones).
 */
export async function generateTestContent(
  name: string,
  knownCodes: { questCode: string | null; labcorpCode: string | null } = { questCode: null, labcorpCode: null },
  availableCategories: string[] = [],
): Promise<GeneratedTestContent> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const needQuest = !knownCodes.questCode;
  const needLabcorp = !knownCodes.labcorpCode;
  const codeInstruction =
    needQuest || needLabcorp
      ? `Provide${needQuest ? ' the Quest order code' : ''}${needQuest && needLabcorp ? ' and' : ''}${needLabcorp ? ' the LabCorp order code' : ''} if you know the standard code for this exact test; null only if unsure.`
      : 'Both order codes are already known; return null for questCode and labcorpCode.';
  const categoryInstruction = availableCategories.length
    ? `Existing categories to choose from (use exact strings): ${availableCategories.join(', ')}.`
    : 'No category list was provided — return an empty categoryNames array.';

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 3000, // room for adaptive thinking + content fields (JSON truncation → parse error)
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA }, effort: 'medium' },
    messages: [
      {
        role: 'user',
        content:
          `Lab test: "${name}".\n${codeInstruction}\n${categoryInstruction}\n` +
          'Return shortName, the five content fields (description, purpose, procedure = how it\'s performed, ' +
          'preparation = how to prepare, normalRange = normal ranges), categoryNames, questCode and labcorpCode.',
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No structured output returned');
  const parsed = JSON.parse(text.text) as GeneratedTestContent;

  // Never let the model override codes we already trust from the catalog.
  if (knownCodes.questCode) parsed.questCode = null;
  if (knownCodes.labcorpCode) parsed.labcorpCode = null;
  if (!Array.isArray(parsed.categoryNames)) parsed.categoryNames = [];
  return parsed;
}
