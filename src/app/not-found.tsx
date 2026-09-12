'use client';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'No encontrado — CopyPasteSocial',
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground">Página no encontrada.</p>
      </div>
    </div>
  );
}