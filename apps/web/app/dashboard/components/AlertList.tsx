'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Alert {
  id: string;
  testId: string;
  testName: string;
  testSlug: string;
  targetPrice: number | null;
  thresholdPercent: number | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
}

export default function AlertList({ alerts: initialAlerts }: { alerts: Alert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/v1/me/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a)));
    }
  }

  async function deleteAlert(id: string) {
    const res = await fetch(`/api/v1/me/alerts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }
  }

  if (alerts.length === 0) {
    return (
      <p className="text-sm text-[oklch(0.55_0.04_280)]">
        No price alerts set. Visit a test page and click the bell icon to create one.
      </p>
    );
  }

  return (
    <div className="bg-white rounded-card border-[1.5px] border-[oklch(0.92_0.02_280)] overflow-hidden">
      {alerts.map((alert, i) => {
        const condition = alert.targetPrice != null
          ? `Target: $${alert.targetPrice.toFixed(2)}`
          : `Drop: ${alert.thresholdPercent}%`;
        const status = alert.lastTriggeredAt ? 'Triggered' : alert.isActive ? 'Active' : 'Paused';
        const statusColor = alert.lastTriggeredAt
          ? 'oklch(0.45 0.15 75)'
          : alert.isActive
            ? 'oklch(0.45 0.15 145)'
            : 'oklch(0.55 0.04 280)';

        return (
          <div
            key={alert.id}
            className="flex items-center gap-4 px-5 py-3.5"
            style={{ borderTop: i > 0 ? '1px solid oklch(0.94 0.01 280)' : undefined }}
          >
            <div className="flex-1 min-w-0">
              <Link
                href={`/test/${alert.testSlug}`}
                className="text-sm font-semibold text-[oklch(0.2_0.04_280)] no-underline hover:underline"
              >
                {alert.testName}
              </Link>
              <div className="text-xs text-[oklch(0.55_0.04_280)] mt-0.5">{condition}</div>
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-[0.4px] px-2 py-0.5 rounded-pill"
              style={{ background: `color-mix(in oklch, ${statusColor} 15%, white)`, color: statusColor }}
            >
              {status}
            </span>
            <button
              onClick={() => toggleActive(alert.id, alert.isActive)}
              className="text-xs text-[oklch(0.5_0.1_280)] hover:text-[oklch(0.4_0.15_280)] cursor-pointer bg-transparent border-none"
            >
              {alert.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={() => deleteAlert(alert.id)}
              className="text-xs text-[oklch(0.55_0.04_280)] hover:text-red-600 cursor-pointer bg-transparent border-none"
            >
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
}
