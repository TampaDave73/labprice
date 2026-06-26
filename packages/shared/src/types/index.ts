import type { Role } from '@labprice/database';

export type { Role } from '@labprice/database';

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  total?: number;
}

export interface CursorParams {
  cursor?: string;
  limit?: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  image: string | null;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type MoneyString = string; // "29.00"

export interface TestSummaryDTO {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  category: {
    id: string;
    name: string;
    slug: string;
    colorBg: string | null;
    colorText: string | null;
  };
  codes: { codeType: 'QUEST' | 'LABCORP'; codeValue: string }[];
  minPrice: MoneyString | null;
  vendorCount: number;
  isPopular: boolean;
}

export interface OfferingDTO {
  id: string;
  testId: string;
  vendor: {
    id: string;
    name: string;
    slug: string;
    websiteUrl: string | null;
    logoUrl: string | null;
  };
  currentPrice: MoneyString | null;
  previousPrice: MoneyString | null;
  priceUpdatedAt: string | null;
  externalUrl: string | null;
  isActive: boolean;
  isCheapest: boolean;
}
