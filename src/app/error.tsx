'use client';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Error — CopyPasteSocial',
};

export default function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Algo salió mal</h1>
        <p className="text-muted-foreground">Intentá de nuevo más tarde.</p>
      </div>
    </div>
  );
}