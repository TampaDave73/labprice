export const RATE_LIMITS = {
  PUBLIC_READ: { windowMs: 60_000, max: 120 },
  PUBLIC_WRITE: { windowMs: 60_000, max: 30 },
  AUTHED_READ: { windowMs: 60_000, max: 300 },
  AUTHED_WRITE: { windowMs: 60_000, max: 60 },
  ADMIN: { windowMs: 60_000, max: 600 },
  INTERNAL: { windowMs: 60_000, max: 1000 },
} as const;

export const CACHE_TTL = {
  TESTS_LIST: 300,
  TEST_DETAIL: 300,
  CATEGORIES: 600,
  VENDORS: 600,
  AUTOCOMPLETE: 120,
  OFFERINGS: 300,
} as const;

export const MAX_AUTOCOMPLETE_RESULTS = 6;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  EDITOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export * from './catalog-adapters';
