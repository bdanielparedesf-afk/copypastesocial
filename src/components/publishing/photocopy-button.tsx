'use client';

import * as React from 'react';
import { Rocket } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/utils';

interface PhotocopyButtonProps
  extends Omit<ButtonProps, 'variant' | 'size'> {
  label: string;
  totalJobs: number;
  loading?: boolean;
}

const PhotocopyButton = React.forwardRef<HTMLButtonElement, PhotocopyButtonProps>(
  ({ label, totalJobs, loading, disabled, className, ...props }, ref) => (
    <Button
      ref={ref}
      variant="default"
      size="lg"
      disabled={disabled || loading}
      className={cn(
        'h-14 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500',
        'text-white font-bold shadow-[0_0_30px_rgba(124,58,237,0.5)]',
        'hover:scale-[1.02] active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100',
        'transition-all duration-200',
        className
      )}
      {...props}
    >
      <Rocket className={cn('h-5 w-5', loading && 'animate-spin')} />
      <span className="text-base">
        {loading ? 'Copiando...' : label}
      </span>
    </Button>
  )
);
PhotocopyButton.displayName = 'PhotocopyButton';

export { PhotocopyButton };