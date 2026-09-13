/**
 * FASE 6 — Helpers de simulación (MOCK_MODE).
 *
 * MOCK_MODE=true permite desarrollar y testear el flujo de importación
 * SIN contactar ninguna API externa. La lectura del env se hace en RUNTIME
 * (no en import) para que los tests puedan activarla con vi.stubEnv.
 */
import type { SourceAccessibility, MediaItem } from './interface';

export function isMockEnabled(): boolean {
  return process.env.MOCK_MODE === 'true';
}

/**
 * Heurística determinista para simular estados por identificador:
 *   .../error-x    → ERROR
 *   .../quota-x    → API_RESTRICTED
 *   .../auth-x     → AUTH_REQUIRED
 *   .../private-x  → PRIVATE
 *   .../gone-x     → UNAVAILABLE
 *   resto          → ACCESSIBLE
 */
export function mockAccessibility(identifier: string): SourceAccessibility {
  const id = identifier.toLowerCase();
  if (id.includes('error')) return 'ERROR';
  if (id.includes('quota') || id.includes('restricted')) return 'API_RESTRICTED';
  if (id.includes('auth')) return 'AUTH_REQUIRED';
  if (id.includes('private')) return 'PRIVATE';
  if (id.includes('gone') || id.includes('missing') || id.includes('deleted')) return 'UNAVAILABLE';
  return 'ACCESSIBLE';
}

/**
 * Genera items simulados deterministas:
 * - Perfiles → 12 items (coincide con el ejemplo de UI "12 videos encontrados").
 * - Contenido individual (post/video/short) → 1 item.
 */
export function mockMediaItems(
  provider: 'instagram' | 'youtube' | 'facebook',
  identifier: string,
  contentType: 'profile' | 'post' | 'reel' | 'short' | 'video',
  type: 'video' | 'image' | 'carousel'
): MediaItem[] {
  const count = contentType === 'profile' ? 12 : 1;
  return Array.from({ length: count }, (_, index) => ({
    externalId: `mock-${provider}-${identifier}-${index + 1}`,
    url: `https://mock.copypastesocial.local/${provider}/${identifier}/item/${index + 1}`,
    title: `${provider === 'instagram' ? 'Publicación' : 'Video'} ${identifier} #${index + 1}`,
    thumbnailUrl: `https://mock.copypastesocial.local/thumb/${provider}/${identifier}/${index + 1}.jpg`,
    type,
    duration: type === 'video' ? 30 + index : null,
    width: 1080,
    height: 1920,
    publishedAt: null,
    metadata: { mock: true, provider, identifier, index: index + 1 },
  }));
}
