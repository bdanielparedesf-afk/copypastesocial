import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive/15 text-destructive',
        outline: 'border border-input text-foreground',
        status: '',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[11px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  status?: string;
}

function Badge({ className, variant, size, status, ...props }: BadgeProps) {
  if (status) {
    return (
      <div
        className={cn(
          badgeVariants({ variant: 'status', size }),
          `status-${status.toLowerCase()}`,
          className
        )}
        {...props}
      />
    );
  }
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };