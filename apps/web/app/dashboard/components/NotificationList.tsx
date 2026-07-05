'use client';

import { useState } from 'react';

interface Notification {
  id: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationList({ notifications: initial }: { notifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initial);

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const res = await fetch('/api/v1/me/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }
  }

  if (notifications.length === 0) {
    return (
      <p className="text-sm text-[oklch(0.55_0.04_230)]">No notifications yet.</p>
    );
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div>
      {hasUnread && (
        <button
          onClick={markAllRead}
          className="text-xs font-medium text-[oklch(0.5_0.093_230)] hover:underline cursor-pointer bg-transparent border-none mb-3"
        >
          Mark all read
        </button>
      )}
      <div className="bg-white rounded-card border-[1.5px] border-[oklch(0.92_0.02_230)] overflow-hidden">
        {notifications.map((n, i) => (
          <div
            key={n.id}
            className="flex items-start gap-3 px-5 py-3.5"
            style={{
              borderTop: i > 0 ? '1px solid oklch(0.94 0.01 230)' : undefined,
              background: n.isRead ? '#fff' : 'oklch(0.97 0.02 230)',
            }}
          >
            <div
              className="w-2 h-2 rounded-full mt-1.5 shrink-0"
              style={{ background: n.isRead ? 'transparent' : 'oklch(0.55 0.124 230)' }}
            />
            <div className="flex-1 min-w-0">
              {n.link ? (
                <a href={n.link} className="text-sm text-[oklch(0.2_0.04_230)] no-underline hover:underline">
                  {n.message}
                </a>
              ) : (
                <span className="text-sm text-[oklch(0.2_0.04_230)]">{n.message}</span>
              )}
              <div className="text-[11px] text-[oklch(0.6_0.04_230)] mt-0.5">
                {new Date(n.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
