import { prisma } from '@labprice/database';

export default async function OfferingsPage() {
  const offerings = await prisma.offering.findMany({
    where: { deletedAt: null },
    take: 50,
    orderBy: { updatedAt: 'desc' },
    include: {
      test: { select: { name: true } },
      vendor: { select: { name: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-900">Offerings</h1>
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">Test</th>
              <th className="p-3">Vendor</th>
              <th className="p-3 text-right">Current Price</th>
              <th className="p-3 text-right">Previous Price</th>
              <th className="p-3">Last Updated</th>
              <th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {offerings.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">No offerings found.</td></tr>
            ) : (
              offerings.map((o) => (
                <tr key={o.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3 font-medium text-brand-900">{o.test.name}</td>
                  <td className="p-3 text-brand-600">{o.vendor.name}</td>
                  <td className="p-3 text-right font-medium text-brand-900">{o.currentPrice ? `$${Number(o.currentPrice).toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-right text-brand-400">{o.previousPrice ? `$${Number(o.previousPrice).toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-brand-400">{o.priceUpdatedAt ? new Date(o.priceUpdatedAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${o.isActive ? 'bg-success-500' : 'bg-brand-200'}`} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
