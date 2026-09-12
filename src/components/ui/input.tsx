import * as React from 'react';
import { cn } from '@/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background transition-all duration-200',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            icon && 'pl-10',
            error && 'border-destructive focus:ring-destructive/50',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };