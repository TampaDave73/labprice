import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function Card({ children, className, onClick, interactive }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-card border-[1.5px] border-brand-200',
        interactive && 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-brand-300',
        className,
      )}
    >
      {children}
    </div>
  );
}
