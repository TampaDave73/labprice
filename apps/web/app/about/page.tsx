import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';
import StaticPageBody from '../components/StaticPageBody';
import { getPageContent } from '@/lib/static-pages';

// Content is editable at /admin/pages (falls back to the default in lib/static-pages.ts). ISR: edits
// are pushed immediately via revalidatePath in the admin PATCH; this is just a safety refresh window.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('about');
  return { title: c.title, description: 'What LabTestCompare does and why we built it.' };
}

export default async function AboutPage() {
  const c = await getPageContent('about');
  return (
    <StaticPageLayout title={c.title} updated={c.updated ?? undefined}>
      <StaticPageBody body={c.body} />
    </StaticPageLayout>
  );
}
