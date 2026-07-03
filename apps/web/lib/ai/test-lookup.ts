// AI-assisted test metadata generation (Claude).
//
// WHY: when an admin adds a lab test, we auto-fill patient-facing copy (description / purpose /
// how it's performed / how to prepare / normal ranges) and, as a *fallback only*, the Quest/LabCorp
// order codes when our vendor catalogs didn't have them. Codes are safety-critical, so the model is
// instructed to leave a code null unless it is confident it's the standard order code — the catalog
// lookup (see @labprice/scrapers code-lookup) remains the authoritative source and always wins.
//
// Uses the official Anthropic SDK. Reads ANTHROPIC_API_KEY from the environment; when it's absent the
// caller degrades gracefully (codes-from-catalog only, no generated content).
import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedTestContent {
  description: string;
  purpose: string;
  procedure: string; // "How It's Performed"
  preparation: string; // "How To Prepare"
  normalRange: string; // "Normal Ranges"
  questCode: string | null; // only when confident AND not already supplied
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
    description: { type: 'string' },
    purpose: { type: 'string' },
    procedure: { type: 'string' },
    preparation: { type: 'string' },
    normalRange: { type: 'string' },
    questCode: { type: ['string', 'null'] },
    labcorpCode: { type: ['string', 'null'] },
  },
  required: ['description', 'purpose', 'procedure', 'preparation', 'normalRange', 'questCode', 'labcorpCode'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'You write accurate, patient-facing reference copy for a blood-test price-comparison site (LabTestCompare).',
  'Audience: US consumers with no medical background. Be factual, neutral, and concise; no marketing language,',
  'no medical advice, no dosing, no diagnosis. Write in plain sentences (no markdown, no bullet symbols).',
  'If a field genuinely does not apply to this test, give a short honest note rather than inventing specifics.',
  'For normal ranges, state that reference ranges vary by lab, sex, and age, and give typical adult ranges only',
  'when they are well-established and standard.',
  'Order codes are safety-critical: only fill questCode / labcorpCode when you are confident it is the standard',
  'order code for THIS exact test; otherwise return null. Never guess a code.',
].join(' ');

/**
 * Generate the five content fields for a test, plus optional code fallbacks.
 * @param knownCodes codes already resolved from catalogs — passed so the model skips them (returns null).
 */
export async function generateTestContent(
  name: string,
  knownCodes: { questCode: string | null; labcorpCode: string | null } = { questCode: null, labcorpCode: null },
): Promise<GeneratedTestContent> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const needQuest = !knownCodes.questCode;
  const needLabcorp = !knownCodes.labcorpCode;
  const codeInstruction =
    needQuest || needLabcorp
      ? `We still need${needQuest ? ' the Quest order code' : ''}${needQuest && needLabcorp ? ' and' : ''}${needLabcorp ? ' the LabCorp order code' : ''} — fill only if confident, else null.`
      : 'Both order codes are already known; return null for questCode and labcorpCode.';

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 3000, // room for adaptive thinking + five content fields (JSON truncation → parse error)
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA }, effort: 'medium' },
    messages: [
      {
        role: 'user',
        content:
          `Lab test: "${name}".\n${codeInstruction}\n` +
          'Return the five content fields (description, purpose, procedure = how it\'s performed, ' +
          'preparation = how to prepare, normalRange = normal ranges) plus questCode and labcorpCode.',
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No structured output returned');
  const parsed = JSON.parse(text.text) as GeneratedTestContent;

  // Never let the model override codes we already trust from the catalog.
  if (knownCodes.questCode) parsed.questCode = null;
  if (knownCodes.labcorpCode) parsed.labcorpCode = null;
  return parsed;
}
