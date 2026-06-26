import { describe, it, expect } from 'vitest';
import { normalizePrice, detectChange, shouldAutoApprove } from '../normalizer';

describe('normalizePrice', () => {
  it('parses a simple dollar amount', () => {
    expect(normalizePrice('$49.99')).toBe(49.99);
  });

  it('strips commas', () => {
    expect(normalizePrice('$1,299.00')).toBe(1299.0);
  });

  it('handles whitespace', () => {
    expect(normalizePrice('  $ 79.00  ')).toBe(79.0);
  });

  it('takes the lower bound of a range (hyphen)', () => {
    expect(normalizePrice('$49.99 - $89.99')).toBe(49.99);
  });

  it('takes the lower bound of a range (en-dash)', () => {
    expect(normalizePrice('$25.00 – $50.00')).toBe(25.0);
  });

  it('handles plain numbers without dollar sign', () => {
    expect(normalizePrice('29.99')).toBe(29.99);
  });

  it('rounds to two decimal places', () => {
    expect(normalizePrice('$19.999')).toBe(20.0);
  });

  it('throws on unparseable input', () => {
    expect(() => normalizePrice('free')).toThrow('Unable to parse price');
  });

  it('throws on negative prices', () => {
    expect(() => normalizePrice('-$5.00')).toThrow('Negative price');
  });
});

describe('detectChange', () => {
  it('returns same when prices are equal', () => {
    const result = detectChange(49.99, 49.99);
    expect(result.changed).toBe(false);
    expect(result.direction).toBe('same');
    expect(result.percentChange).toBe(0);
  });

  it('detects an increase', () => {
    const result = detectChange(100, 110);
    expect(result.changed).toBe(true);
    expect(result.direction).toBe('up');
    expect(result.percentChange).toBe(10);
  });

  it('detects a decrease', () => {
    const result = detectChange(100, 90);
    expect(result.changed).toBe(true);
    expect(result.direction).toBe('down');
    expect(result.percentChange).toBe(-10);
  });

  it('handles zero current price', () => {
    const result = detectChange(0, 50);
    expect(result.changed).toBe(true);
    expect(result.percentChange).toBe(100);
  });
});

describe('shouldAutoApprove', () => {
  it('BR-6: auto-approves small change with high accuracy', () => {
    expect(shouldAutoApprove(3, 98)).toBe('auto_approve');
  });

  it('BR-6: does not auto-approve if accuracy is too low', () => {
    expect(shouldAutoApprove(3, 90)).toBe('manual_review');
  });

  it('BR-6: does not auto-approve if change is >= 5%', () => {
    expect(shouldAutoApprove(5, 98)).toBe('manual_review');
  });

  it('BR-8: flags for manual review if change > 20%', () => {
    expect(shouldAutoApprove(25, 99)).toBe('manual_review');
  });

  it('BR-8: flags negative change > 20% for manual review', () => {
    expect(shouldAutoApprove(-25, 99)).toBe('manual_review');
  });

  it('BR-9: auto-rejects zero price', () => {
    expect(shouldAutoApprove(5, 99, 0)).toBe('auto_reject');
  });

  it('BR-9: auto-rejects negative price', () => {
    expect(shouldAutoApprove(5, 99, -10)).toBe('auto_reject');
  });

  it('returns manual_review for moderate changes', () => {
    expect(shouldAutoApprove(10, 98)).toBe('manual_review');
  });
});
