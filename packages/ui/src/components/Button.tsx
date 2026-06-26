import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center font-semibold transition-all cursor-pointer',
          {
            'bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-btn hover:opacity-90':
              variant === 'primary',
            'bg-white text-brand-700 border-[1.5px] border-brand-200 rounded-btn hover:border-brand-400':
              variant === 'secondary',
            'bg-transparent text-brand-700 hover:bg-brand-50 rounded-btn':
              variant === 'ghost',
            'px-3 py-1.5 text-xs': size === 'sm',
            'px-5 py-2.5 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
