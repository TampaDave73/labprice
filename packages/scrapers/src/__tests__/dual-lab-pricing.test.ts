import { describe, it, expect } from 'vitest';
import { rankDualLabPrices } from '../catalog/dual-lab-pricing';

describe('rankDualLabPrices', () => {
  it('ranks quest as primary when cheaper', () => {
    expect(rankDualLabPrices(45, 60)).toEqual({
      currentPrice: 45, labProvider: 'quest', altLabPrice: 60, altLabProvider: 'labcorp',
    });
  });

  it('ranks labcorp as primary when cheaper', () => {
    expect(rankDualLabPrices(65, 55)).toEqual({
      currentPrice: 55, labProvider: 'labcorp', altLabPrice: 65, altLabProvider: 'quest',
    });
  });

  it('ties go to quest', () => {
    expect(rankDualLabPrices(50, 50)).toEqual({
      currentPrice: 50, labProvider: 'quest', altLabPrice: 50, altLabProvider: 'labcorp',
    });
  });

  it('only quest priced', () => {
    expect(rankDualLabPrices(50, null)).toEqual({
      currentPrice: 50, labProvider: 'quest', altLabPrice: null, altLabProvider: null,
    });
  });

  it('only labcorp priced', () => {
    expect(rankDualLabPrices(null, 50)).toEqual({
      currentPrice: 50, labProvider: 'labcorp', altLabPrice: null, altLabProvider: null,
    });
  });

  it('neither priced', () => {
    expect(rankDualLabPrices(null, null)).toEqual({
      currentPrice: null, labProvider: null, altLabPrice: null, altLabProvider: null,
    });
  });
});
