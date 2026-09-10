import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';
import StaticPageBody from '../components/StaticPageBody';
import { getPageContent } from '@/lib/static-pages';

// Content is editable at /admin/pages (see about/page.tsx for the ISR note).
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('disclaimer');
  return {
    title: c.title,
    description:
      'LabTestCompare publishes lab test prices and general information, not medical advice. What that means for reference ranges, results, prices, and emergencies.',
    alternates: { canonical: '/disclaimer' },
  };
}

export default async function DisclaimerPage() {
  const c = await getPageContent('disclaimer');
  return (
    <StaticPageLayout title={c.title} updated={c.updated ?? undefined}>
      <StaticPageBody body={c.body} />
    </StaticPageLayout>
  );
}
