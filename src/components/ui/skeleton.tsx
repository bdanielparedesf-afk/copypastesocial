import { cn } from '@/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
}

function Skeleton({ className, variant = 'rectangular', ...props }: SkeletonProps) {
  const variants = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full aspect-square',
    rectangular: 'rounded-lg',
    card: 'rounded-xl p-4 space-y-3',
  };
  return (
    <div
      className={cn(
        'bg-muted/50 relative overflow-hidden',
        'before:absolute before:inset-0',
        'before:-translate-x-full before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };