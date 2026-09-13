/**
 * FASE 6 — Tests de InstagramSourceProvider con MOCK_MODE=true.
 * No se contacta ninguna API real; los estados se simulan de forma
 * determinista por keywords en la URL (private/auth/quota/gone/error).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InstagramSourceProvider } from './instagram';

describe('InstagramSourceProvider (MOCK_MODE=true)', () => {
  const provider = new InstagramSourceProvider();

  beforeEach(() => {
    vi.stubEnv('MOCK_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('canHandle', () => {
    it('maneja URLs de Instagram', () => {
      expect(provider.canHandle('https://www.instagram.com/p/Cr5KJQvu1Hs/')).toBe(true);
      expect(provider.canHandle('https://www.instagram.com/usuario/')).toBe(true);
    });

    it('no maneja URLs de otras plataformas', () => {
      expect(provider.canHandle('https://www.youtube.com/watch?v=abc')).toBe(false);
      expect(provider.canHandle('https://www.facebook.com/pagina/videos/1/')).toBe(false);
    });
  });

  describe('checkAccessibility', () => {
    it('perfil público → ACCESSIBLE', async () => {
      const result = await provider.checkAccessibility('https://www.instagram.com/usuario.publico/');
      expect(result).toBe('ACCESSIBLE');
    });

    it('perfil privado → PRIVATE', async () => {
      const result = await provider.checkAccessibility('https://www.instagram.com/usuario.private/');
      expect(result).toBe('PRIVATE');
    });

    it('auth requerido → AUTH_REQUIRED', async () => {
      const result = await provider.checkAccessibility('https://www.instagram.com/usuario.auth/');
      expect(result).toBe('AUTH_REQUIRED');
    });

    it('cuota agotada → API_RESTRICTED', async () => {
      const result = await provider.checkAccessibility('https://www.instagram.com/usuario.quota/');
      expect(result).toBe('API_RESTRICTED');
    });

    it('contenido eliminado → UNAVAILABLE', async () => {
      const result = await provider.checkAccessibility('https://www.instagram.com/p/gone123/');
      expect(result).toBe('UNAVAILABLE');
    });

    it('fallo inesperado → ERROR', async () => {
      const result = await provider.checkAccessibility('https://www.instagram.com/usuario.error/');
      expect(result).toBe('ERROR');
    });
  });

  describe('fetchMetadata', () => {
    it('perfil accesible retorna 12 items simulados', async () => {
      const items = await provider.fetchMetadata('https://www.instagram.com/usuario.publico/');
      expect(items).toHaveLength(12);
      expect(items[0].externalId).toContain('mock-instagram');
      expect(items[0].metadata).toMatchObject({ mock: true, provider: 'instagram' });
      expect(items[0].url).toContain('mock.copypastesocial.local');
    });

    it('un post público retorna 1 item de tipo imagen', async () => {
      const items = await provider.fetchMetadata('https://www.instagram.com/p/Cr5KJQvu1Hs/');
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('image');
    });

    it('un reel público retorna 1 item de tipo video', async () => {
      const items = await provider.fetchMetadata('https://www.instagram.com/reel/CxYz123abc/');
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('video');
    });

    it('perfil privado no retorna items (nunca se evaden privados)', async () => {
      const items = await provider.fetchMetadata('https://www.instagram.com/usuario.private/');
      expect(items).toHaveLength(0);
    });
  });
});
