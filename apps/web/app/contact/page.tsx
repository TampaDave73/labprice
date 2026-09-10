import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';
import StaticPageBody from '../components/StaticPageBody';
import { getPageContent } from '@/lib/static-pages';

// Content is editable at /admin/pages (see about/page.tsx for the ISR note).
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('contact');
  return {
    title: c.title,
    description:
      'How to reach LabTestCompare: email, postal address in Tampa, Florida, and the fastest way to report a wrong price, a dead link, or a missing lab test.',
    alternates: { canonical: '/contact' },
  };
}

export default async function ContactPage() {
  const c = await getPageContent('contact');
  return (
    <StaticPageLayout title={c.title} updated={c.updated ?? undefined}>
      <StaticPageBody body={c.body} />
    </StaticPageLayout>
  );
}
