// Small English-grammar helpers for copy assembled from catalog data.
//
// Test names come out of the database and get dropped into sentences ("What does a {name} test
// measure?"), which means the sentence has to agree with a string nobody wrote by hand. Getting it
// wrong is visible in the worst place — the page's `<h2>`s shipped "What does a Iron & TIBC test
// measure?" across five test pages, which is both the most-read text on the page and the exact
// string an answer engine reads back.

/**
 * Letters whose *name* starts with a vowel sound, so an initialism beginning with one takes "an":
 * an IGF-1 (eye), an MTHFR (em), an SHBG (ess). Note this is about how the letter is said, not
 * whether it is a vowel — F, H, L, M, N, R, S and X are consonants that are spoken vowel-first.
 */
const AN_LETTERS = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);

/**
 * An initialism is read letter by letter, so its article follows the first letter's *name*, not the
 * word's spelling. Detected as a leading run of two or more capitals, or a capital followed by a
 * digit — which catches IGF-1, DHEA, TSH, PSA and T3 while leaving ordinary capitalised words
 * ("Iron", "C-Reactive") to the vowel rule below.
 */
const INITIALISM = /^([A-Z]{2,}|[A-Z]\d)/;

/**
 * Words that start with a vowel letter but a "yoo" consonant sound, and so take "a": a uric acid
 * test, a urea panel, a urinalysis. This is a LIST, not a rule — English is not consistent here
 * ("an urgent test", "an urn"), so it covers the lab/medical vocabulary this catalog actually uses
 * rather than pretending to be general. Extend it when a name needs it; don't generalise it.
 */
const YOO_SOUND = /^u(ri|re|ro|ni|se|su|ti)/i;

/** Vowel letters with a silent leading h — an hour, an honest result. */
const SILENT_H = /^(hour|honest|honor|heir)/i;

/**
 * "a" or "an" for a phrase, decided by how the phrase is *said* rather than how it is spelled.
 *
 * Deliberately not exported as a `.toLowerCase().startsWith('aeiou')` one-liner: that would turn
 * "a Uric Acid test" (correct — "yoo") into "an Uric Acid test", trading five wrong headings for a
 * different wrong heading.
 */
export function indefiniteArticle(phrase: string): 'a' | 'an' {
  const first = phrase.trim().split(/\s+/)[0]?.replace(/^[^A-Za-z0-9]+/, '') ?? '';
  if (!first) return 'a';

  if (INITIALISM.test(first)) return AN_LETTERS.has(first[0]!.toUpperCase()) ? 'an' : 'a';
  if (SILENT_H.test(first)) return 'an';
  if (YOO_SOUND.test(first)) return 'a';
  return /^[aeiou]/i.test(first) ? 'an' : 'a';
}

/** `indefiniteArticle` with the phrase attached: "an Iron & TIBC test". */
export function withArticle(phrase: string): string {
  return `${indefiniteArticle(phrase)} ${phrase}`;
}

/** Names that already end in a noun, so appending "test" would read as "a Lipid Panel test". */
const HAS_NOUN = /\b(test|panel|profile|screen|screening|count)\b\.?$/i;

/**
 * A test name that can be dropped into a sentence. Most of the catalog is bare analytes ("Ferritin")
 * that read wrong without a trailing noun, but some already carry one ("Lipid Panel", "Arsenic Blood
 * Test"), so the noun is only added when it isn't there.
 *
 * Shared between the page's headings and its FAQ so the two phrase the same test the same way — a
 * reader shouldn't meet "a Ferritin test" in an H2 and "a Ferritin" six inches lower.
 */
export function testPhrase(name: string): string {
  // A trailing parenthetical is an abbreviation or a variant marker, not the noun: "Comprehensive
  // Metabolic Panel (14)" already ends in a noun and doesn't want "test" bolted on after it.
  const withoutParenthetical = name.trim().replace(/\s*\([^)]*\)\s*$/, '');
  return HAS_NOUN.test(withoutParenthetical) ? name : `${name} test`;
}
