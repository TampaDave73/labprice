import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';
import StaticPageBody from '../components/StaticPageBody';
import { getPageContent } from '@/lib/static-pages';

// Content is editable at /admin/pages (see about/page.tsx for the ISR note).
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('editorial-policy');
  return {
    title: c.title,
    description: 'Where LabTestCompare prices and health information come from, how they are checked, and how results are ranked.',
    alternates: { canonical: '/editorial-policy' },
  };
}

export default async function EditorialPolicyPage() {
  const c = await getPageContent('editorial-policy');
  return (
    <StaticPageLayout title={c.title} updated={c.updated ?? undefined}>
      <StaticPageBody body={c.body} />
    </StaticPageLayout>
  );
}
