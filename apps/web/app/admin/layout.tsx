import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import AdminSidebar from './components/AdminSidebar';

export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen bg-brand-50">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b border-brand-100 bg-white px-6 md:px-10">
          <div className="text-sm text-brand-700">
            <span className="font-medium text-brand-900">{session.user.name ?? 'Admin'}</span>
            <span className="ml-2 text-brand-400">{session.user.email}</span>
          </div>
        </header>
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
