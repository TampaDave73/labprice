import { z } from 'zod';

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  ...paginationSchema.shape,
});

export const autocompleteSchema = z.object({
  q: z.string().min(2).max(200),
});

export const createAlertSchema = z.object({
  testId: z.string().min(1),
  vendorId: z.string().optional(),
  targetPrice: z.string().regex(/^\d+\.\d{2}$/).optional(),
  thresholdPercent: z.coerce.number().int().min(1).max(100).optional(),
}).refine(
  (data) => (data.targetPrice != null) !== (data.thresholdPercent != null),
  { message: 'Exactly one of targetPrice or thresholdPercent must be set' },
);

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const registerSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).optional(),
});

export const pageviewSchema = z.object({
  path: z.string().max(500),
  testId: z.string().optional(),
  sessionId: z.string().optional(),
});
