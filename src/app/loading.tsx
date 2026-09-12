import { Spinner } from '@/components/ui';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Spinner size={32} />
    </div>
  );
}