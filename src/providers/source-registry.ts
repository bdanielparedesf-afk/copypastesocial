/**
 * FASE 6 — Registro de Source Providers (importación de contenido).
 *
 * Distinto de ./registry.ts (providers de auditoría BaseProvider, Fase 2).
 */
import { detectSource } from '@/services/source-detector';
import type { SourceProvider, SourceProviderName } from './interface';
import { InstagramSourceProvider } from './instagram';
import { YoutubeSourceProvider } from './youtube';
import { FacebookSourceProvider } from './facebook';

/** Instancias compartidas (permite inyectar tokens de usuario en Fase 9-12). */
export const sourceProviders: SourceProvider[] = [
  new InstagramSourceProvider(),
  new YoutubeSourceProvider(),
  new FacebookSourceProvider(),
];

export function getSourceProvider(name: SourceProviderName): SourceProvider | undefined {
  return sourceProviders.find((p) => p.name === name);
}

export function getSourceProviderForUrl(url: string): SourceProvider | undefined {
  const detected = detectSource(url);
  if (detected.provider === 'unsupported') return undefined;
  return getSourceProvider(detected.provider);
}

export {
  InstagramSourceProvider,
  YoutubeSourceProvider,
  FacebookSourceProvider,
};
