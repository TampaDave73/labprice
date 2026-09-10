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
  // A same-site path (/blog/x.webp) or an absolute https URL. `.url()` alone rejected every hero on
  // the site — they are all self-hosted relative paths — so saving ANY post from the admin editor
  // failed with a bare "Invalid post". http:// is excluded so a hero can't downgrade the page.
  heroUrl: z
    .string()
    .trim()
    .max(600)
    .refine((v) => v === '' || v.startsWith('/') || /^https:\/\//.test(v), {
      message: 'Hero image must be a site path like /blog/name.webp, or an https:// URL',
    })
    .nullish(),
  heroAlt: z.string().trim().max(400).nullish().or(z.literal('')),
  heroCredit: z.string().trim().max(300).nullish().or(z.literal('')),
  faq: z.string().trim().max(20000).nullish().or(z.literal('')),
  // 20, not 12: a drafted article on a broad topic can legitimately name a dozen tests (the
  // autoimmune draft named exactly 12, i.e. sat on the old limit), and the cards render in a
  // responsive grid that copes fine with more.
  relatedTests: z.array(z.string().trim()).max(20).default([]),
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
