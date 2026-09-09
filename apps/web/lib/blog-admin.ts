// Validation + cache invalidation shared by the two admin post routes.
//
// Lives here rather than in `app/api/v1/admin/posts/route.ts` because App Router route files are
// type-checked against a fixed export shape — anything other than the HTTP handlers fails the build.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slug rules match the rest of the site: lowercase, hyphen-separated, URL-safe with no escaping.
export const postSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens').max(120),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(600),
  body: z.string().trim().min(1).max(80000),
  author: z.string().trim().min(1).max(100).default('Dave S.'),
  heroUrl: z.string().trim().url().max(600).nullish().or(z.literal('')),
  heroAlt: z.string().trim().max(400).nullish().or(z.literal('')),
  heroCredit: z.string().trim().max(300).nullish().or(z.literal('')),
  faq: z.string().trim().max(20000).nullish().or(z.literal('')),
  relatedTests: z.array(z.string().trim()).max(12).default([]),
  isPublished: z.boolean().default(false),
});

export type PostInput = z.infer<typeof postSchema>;

/** '' → null, so an emptied optional field clears the column instead of storing a blank string. */
export function blank(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Publishing/editing should show on the live site immediately, not after a cache window. */
export function revalidatePost(slug: string) {
  revalidatePath('/blog');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/sitemap.xml');
}
