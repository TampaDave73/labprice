// Admin CRUD for the editable static pages (About / Terms / Privacy / Disclaimer). Content is stored
// in system_settings under `page_<slug>`; see lib/static-pages.ts. Saving revalidates the public path
// so edits show immediately despite the page's ISR window.
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { PAGE_DEFS, PAGE_BY_SLUG, pageSettingKey, getPageContent } from '@/lib/static-pages';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  // Effective (saved-or-default) content for every page, plus the label for the admin list.
  const pages = await Promise.all(
    PAGE_DEFS.map(async (def) => ({ slug: def.slug, label: def.label, ...(await getPageContent(def.slug)) })),
  );
  return NextResponse.json({ data: { pages } });
}

const patchSchema = z.object({
  slug: z.string(),
  title: z.string().trim().min(1).max(200),
  updated: z.string().trim().max(100).optional().or(z.literal('')),
  body: z.string().trim().min(1).max(50000),
});

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid page content', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const { slug, title, updated, body: pageBody } = parsed.data;
  if (!PAGE_BY_SLUG[slug]) {
    return NextResponse.json({ error: { code: 'validation_error', message: `Unknown page: ${slug}` } }, { status: 400 });
  }

  const value = { title, updated: updated || null, body: pageBody };
  await prisma.systemSetting.upsert({
    where: { key: pageSettingKey(slug) },
    create: { key: pageSettingKey(slug), value, updatedBy: session.user.id },
    update: { value, updatedBy: session.user.id },
  });

  // Push the edit to the live page immediately (its ISR window is otherwise up to an hour).
  revalidatePath(`/${slug}`);

  return NextResponse.json({ data: { slug, label: PAGE_BY_SLUG[slug]!.label, ...value } });
}
