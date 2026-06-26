import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Badge({ children, className, style }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-block px-2.5 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
