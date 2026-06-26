import { forwardRef, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          'w-full border-none outline-none bg-transparent text-brand-900 placeholder:text-brand-400/50',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
