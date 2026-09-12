import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CopyPasteSocial — Importa. Selecciona. Publica.',
  description:
    'Importa contenido social, elige lo importante y publícalo en tus destinos sin perder el control.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}