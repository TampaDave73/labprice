import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';
import StaticPageBody from '../components/StaticPageBody';
import { getPageContent } from '@/lib/static-pages';

// Content is editable at /admin/pages (see about/page.tsx for the ISR note).
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('privacy');
  return { title: c.title, description: 'Privacy Policy for LabTestCompare.', alternates: { canonical: '/privacy' } };
}

export default async function PrivacyPage() {
  const c = await getPageContent('privacy');
  return (
    <StaticPageLayout title={c.title} updated={c.updated ?? undefined}>
      <StaticPageBody body={c.body} />
    </StaticPageLayout>
  );
}
