import { describe, expect, it } from 'vitest';
import { isCodeMatch } from '../catalog/autolist';

describe('isCodeMatch', () => {
  it('accepts every code-based matchedBy the ingest matcher can produce', () => {
    expect(isCodeMatch('quest-code')).toBe(true);
    expect(isCodeMatch('labcorp-code')).toBe(true);
    expect(isCodeMatch('any-code')).toBe(true);
  });

  it('rejects name-based matches — they are held for human review', () => {
    expect(isCodeMatch('exact-name')).toBe(false);
    expect(isCodeMatch('alias')).toBe(false);
  });

  it('rejects provenance labels that are not evidence of a code match', () => {
    // 'offering' means "a pre-linked offering priced this product" — the pre-linking model this
    // reset abolishes. 'manual' means a human already listed it, so there is nothing to auto-list.
    expect(isCodeMatch('offering')).toBe(false);
    expect(isCodeMatch('manual')).toBe(false);
  });

  it('rejects null and unknown values rather than defaulting to publish', () => {
    expect(isCodeMatch(null)).toBe(false);
    expect(isCodeMatch('some-future-matcher')).toBe(false);
  });
});
