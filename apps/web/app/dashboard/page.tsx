import { redirect } from 'next/navigation';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SavedTestCard from './components/SavedTestCard';
import AlertList from './components/AlertList';
import NotificationList from './components/NotificationList';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/signin');

  const [savedTests, alerts, notifications] = await Promise.all([
    prisma.savedTest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        test: {
          include: {
            category: true,
            offerings: {
              where: { isActive: true, deletedAt: null, currentPrice: { not: null } },
              orderBy: { currentPrice: 'asc' },
              take: 1,
              select: { currentPrice: true },
            },
          },
        },
      },
    }),
    prisma.priceAlert.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        test: { select: { name: true, slug: true } },
      },
    }),
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const savedTestData = savedTests.map((s) => ({
    id: s.id,
    testId: s.testId,
    name: s.test.name,
    slug: s.test.slug,
    category: s.test.category.name,
    bestPrice: s.test.offerings[0]?.currentPrice
      ? Number(s.test.offerings[0].currentPrice)
      : null,
  }));

  const alertData = alerts.map((a) => ({
    id: a.id,
    testId: a.testId,
    testName: a.test.name,
    testSlug: a.test.slug,
    targetPrice: a.targetPrice ? Number(a.targetPrice) : null,
    thresholdPercent: a.thresholdPercent,
    isActive: a.isActive,
    lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
  }));

  const notificationData = notifications.map((n) => ({
    id: n.id,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.97 0.01 230)' }}>
      <Navbar variant="light" />
      <div className="max-w-[1240px] mx-auto px-6 pt-8 pb-20">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-[oklch(0.15_0.04_230)] mb-8">
          Dashboard
        </h1>

        {/* Saved Tests */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[oklch(0.2_0.04_230)] mb-4">Saved Tests</h2>
          {savedTestData.length === 0 ? (
            <p className="text-sm text-[oklch(0.55_0.04_230)]">
              No saved tests yet. Browse tests and click the bookmark icon to save them here.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedTestData.map((t) => (
                <SavedTestCard key={t.id} savedTest={t} />
              ))}
            </div>
          )}
        </section>

        {/* Price Alerts */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[oklch(0.2_0.04_230)] mb-4">Price Alerts</h2>
          <AlertList alerts={alertData} />
        </section>

        {/* Recent Notifications */}
        <section>
          <h2 className="text-lg font-semibold text-[oklch(0.2_0.04_230)] mb-4">Recent Notifications</h2>
          <NotificationList notifications={notificationData} />
        </section>
      </div>
      <Footer />
    </div>
  );
}
