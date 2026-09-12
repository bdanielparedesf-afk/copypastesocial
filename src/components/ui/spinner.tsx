import { LoaderCircle } from 'lucide-react';
import { cn } from '@/utils';

interface SpinnerProps extends React.HTMLAttributes<SVGSVGElement> {
  size?: number;
}

function Spinner({ className, size = 24, ...props }: SpinnerProps) {
  return (
    <LoaderCircle
      className={cn('animate-spin text-primary', className)}
      size={size}
      {...props}
    />
  );
}

export { Spinner };