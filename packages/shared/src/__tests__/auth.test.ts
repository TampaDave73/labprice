import { describe, it, expect } from 'vitest';
import { hasRole, requireAuth, requireRole } from '../auth';
import type { SessionUser } from '../types';

const makeUser = (role: string): SessionUser => ({
  id: '1', email: 'test@test.com', name: 'Test', role: role as any, image: null,
});

describe('hasRole', () => {
  it('returns true when user has sufficient role', () => {
    expect(hasRole(makeUser('ADMIN'), 'EDITOR')).toBe(true);
    expect(hasRole(makeUser('SUPER_ADMIN'), 'ADMIN')).toBe(true);
    expect(hasRole(makeUser('USER'), 'USER')).toBe(true);
  });

  it('returns false when user has insufficient role', () => {
    expect(hasRole(makeUser('USER'), 'ADMIN')).toBe(false);
    expect(hasRole(makeUser('EDITOR'), 'SUPER_ADMIN')).toBe(false);
  });

  it('returns false for null user', () => {
    expect(hasRole(null, 'USER')).toBe(false);
  });
});

describe('requireAuth', () => {
  it('throws for null user', () => {
    expect(() => requireAuth(null)).toThrow();
  });

  it('does not throw for valid user', () => {
    expect(() => requireAuth(makeUser('USER'))).not.toThrow();
  });
});

describe('requireRole', () => {
  it('throws when user lacks role', () => {
    expect(() => requireRole(makeUser('USER'), 'ADMIN')).toThrow();
  });

  it('passes when user has role', () => {
    expect(() => requireRole(makeUser('ADMIN'), 'EDITOR')).not.toThrow();
  });
});
