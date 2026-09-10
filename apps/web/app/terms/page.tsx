import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';
import StaticPageBody from '../components/StaticPageBody';
import { getPageContent } from '@/lib/static-pages';

// Content is editable at /admin/pages (see about/page.tsx for the ISR note).
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('terms');
  return { title: c.title, description:
      'The terms that govern using LabTestCompare: what the price comparison is and is not, accuracy limits, third-party ordering services, and liability.', alternates: { canonical: '/terms' } };
}

export default async function TermsPage() {
  const c = await getPageContent('terms');
  return (
    <StaticPageLayout title={c.title} updated={c.updated ?? undefined}>
      <StaticPageBody body={c.body} />
    </StaticPageLayout>
  );
}
