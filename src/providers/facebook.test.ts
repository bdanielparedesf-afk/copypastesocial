/**
 * FASE 6 — Tests de FacebookSourceProvider con MOCK_MODE=true.
 * Solo páginas/perfiles públicos vía Graph API; PRIVATE se simula sin
 * intentar jamás eludir el acceso.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FacebookSourceProvider } from './facebook';

describe('FacebookSourceProvider (MOCK_MODE=true)', () => {
  const provider = new FacebookSourceProvider();

  beforeEach(() => {
    vi.stubEnv('MOCK_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('canHandle', () => {
    it('maneja URLs de Facebook', () => {
      expect(provider.canHandle('https://www.facebook.com/pagina/videos/123/')).toBe(true);
      expect(provider.canHandle('https://www.facebook.com/watch/?v=987')).toBe(true);
      expect(provider.canHandle('https://fb.watch/abc123/')).toBe(true);
    });

    it('no maneja URLs de otras plataformas', () => {
      expect(provider.canHandle('https://www.instagram.com/p/ABC/')).toBe(false);
      expect(provider.canHandle('https://www.youtube.com/watch?v=abc')).toBe(false);
    });
  });

  describe('checkAccessibility', () => {
    it('página pública → ACCESSIBLE', async () => {
      const result = await provider.checkAccessibility('https://www.facebook.com/pagina.publica/videos/123/');
      expect(result).toBe('ACCESSIBLE');
    });

    it('perfil privado → PRIVATE', async () => {
      const result = await provider.checkAccessibility('https://www.facebook.com/usuario.private/videos/123/');
      expect(result).toBe('PRIVATE');
    });

    it('auth requerido → AUTH_REQUIRED', async () => {
      const result = await provider.checkAccessibility('https://www.facebook.com/usuario.auth/videos/123/');
      expect(result).toBe('AUTH_REQUIRED');
    });

    it('cuota agotada → API_RESTRICTED', async () => {
      const result = await provider.checkAccessibility('https://www.facebook.com/pagina.quota/videos/123/');
      expect(result).toBe('API_RESTRICTED');
    });
  });

  describe('fetchMetadata', () => {
    it('video de página accesible retorna 1 item simulado', async () => {
      const items = await provider.fetchMetadata('https://www.facebook.com/pagina.publica/videos/123/');
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('video');
      expect(items[0].metadata).toMatchObject({ mock: true, provider: 'facebook' });
    });

    it('item simulado tiene externalId determinista', async () => {
      const items = await provider.fetchMetadata('https://www.facebook.com/pagina.publica/videos/123/');
      expect(items[0].externalId).toContain('mock-facebook');
    });

    it('página privada no retorna items (nunca se evaden privados)', async () => {
      const items = await provider.fetchMetadata('https://www.facebook.com/usuario.private/videos/123/');
      expect(items).toHaveLength(0);
    });
  });
});
