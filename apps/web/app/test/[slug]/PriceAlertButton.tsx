'use client';

import { useState } from 'react';

interface Props {
  testId: string;
}

export default function PriceAlertButton({ testId }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'target' | 'drop'>('target');
  const [targetPrice, setTargetPrice] = useState('');
  const [thresholdPercent, setThresholdPercent] = useState('10');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: Record<string, unknown> = { testId };
      if (mode === 'target') {
        body.targetPrice = parseFloat(targetPrice);
      } else {
        body.thresholdPercent = parseInt(thresholdPercent, 10);
      }

      const res = await fetch('/api/v1/me/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setDone(true);
        setOpen(false);
        setTimeout(() => setDone(false), 3000);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Set price alert"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] border-[1.5px] text-sm font-medium cursor-pointer transition-all"
        style={{
          background: done ? 'oklch(0.95 0.06 145)' : '#fff',
          borderColor: done ? 'oklch(0.8 0.12 145)' : 'oklch(0.88 0.03 230)',
          color: done ? 'oklch(0.38 0.14 145)' : 'oklch(0.45 0.05 230)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 2.5-1.5 4-1.5 4h12s-1.5-1.5-1.5-4A4.5 4.5 0 0 0 8 1.5zM6.5 12a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {done ? 'Alert set' : 'Price alert'}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full mt-2 w-[260px] bg-white rounded-[13px] border-[1.5px] border-[oklch(0.9_0.02_230)] shadow-lg p-4 z-50"
        >
          <div className="text-sm font-semibold text-[oklch(0.2_0.04_230)] mb-3">Set Price Alert</div>

          <div className="flex gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setMode('target')}
              className="flex-1 px-3 py-1.5 rounded-[7px] text-xs font-medium cursor-pointer border-none transition-all"
              style={{
                background: mode === 'target' ? 'oklch(0.58 0.136 230)' : 'oklch(0.96 0.01 230)',
                color: mode === 'target' ? '#fff' : 'oklch(0.5 0.05 230)',
              }}
            >
              Target price
            </button>
            <button
              type="button"
              onClick={() => setMode('drop')}
              className="flex-1 px-3 py-1.5 rounded-[7px] text-xs font-medium cursor-pointer border-none transition-all"
              style={{
                background: mode === 'drop' ? 'oklch(0.58 0.136 230)' : 'oklch(0.96 0.01 230)',
                color: mode === 'drop' ? '#fff' : 'oklch(0.5 0.05 230)',
              }}
            >
              % drop
            </button>
          </div>

          {mode === 'target' ? (
            <div className="mb-3">
              <label className="text-xs text-[oklch(0.55_0.04_230)] block mb-1">
                Notify when price drops to:
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-[oklch(0.4_0.04_230)]">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full px-3 py-1.5 border border-[oklch(0.88_0.03_230)] rounded-[7px] text-sm outline-none focus:border-[oklch(0.6_0.093_230)]"
                  placeholder="29.99"
                />
              </div>
            </div>
          ) : (
            <div className="mb-3">
              <label className="text-xs text-[oklch(0.55_0.04_230)] block mb-1">
                Notify on price drop of:
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={thresholdPercent}
                  onChange={(e) => setThresholdPercent(e.target.value)}
                  className="w-full px-3 py-1.5 border border-[oklch(0.88_0.03_230)] rounded-[7px] text-sm outline-none focus:border-[oklch(0.6_0.093_230)]"
                />
                <span className="text-sm text-[oklch(0.4_0.04_230)]">%</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-[7px] text-xs font-semibold cursor-pointer border-none disabled:opacity-50"
            >
              {loading ? 'Setting...' : 'Set Alert'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-transparent border border-[oklch(0.88_0.03_230)] rounded-[7px] text-xs font-medium cursor-pointer text-[oklch(0.5_0.05_230)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
