/**
 * FASE 6 — Tests de YoutubeSourceProvider con MOCK_MODE=true.
 * Simula ACCESSIBLE, PRIVATE, API_RESTRICTED y AUTH_REQUIRED sin llamar
 * a la YouTube Data API real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YoutubeSourceProvider, parseIsoDuration } from './youtube';

describe('YoutubeSourceProvider (MOCK_MODE=true)', () => {
  const provider = new YoutubeSourceProvider();

  beforeEach(() => {
    vi.stubEnv('MOCK_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('canHandle', () => {
    it('maneja URLs de YouTube', () => {
      expect(provider.canHandle('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(provider.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(provider.canHandle('https://www.youtube.com/@canal/')).toBe(true);
    });

    it('no maneja URLs de otras plataformas', () => {
      expect(provider.canHandle('https://www.instagram.com/p/ABC/')).toBe(false);
      expect(provider.canHandle('https://www.tiktok.com/@u/video/1')).toBe(false);
    });
  });

  describe('checkAccessibility', () => {
    it('canal público → ACCESSIBLE', async () => {
      const result = await provider.checkAccessibility('https://www.youtube.com/@canal.publico');
      expect(result).toBe('ACCESSIBLE');
    });

    it('video privado → PRIVATE', async () => {
      const result = await provider.checkAccessibility('https://www.youtube.com/watch?v=private-video');
      expect(result).toBe('PRIVATE');
    });

    it('auth requerido → AUTH_REQUIRED', async () => {
      const result = await provider.checkAccessibility('https://www.youtube.com/watch?v=auth-required-video');
      expect(result).toBe('AUTH_REQUIRED');
    });

    it('cuota agotada → API_RESTRICTED', async () => {
      const result = await provider.checkAccessibility('https://www.youtube.com/watch?v=quota-video');
      expect(result).toBe('API_RESTRICTED');
    });

    it('video eliminado → UNAVAILABLE', async () => {
      const result = await provider.checkAccessibility('https://www.youtube.com/watch?v=gone-video');
      expect(result).toBe('UNAVAILABLE');
    });
  });

  describe('fetchMetadata', () => {
    it('canal accesible retorna 12 videos simulados', async () => {
      const items = await provider.fetchMetadata('https://www.youtube.com/@canal.publico');
      expect(items).toHaveLength(12);
      expect(items.every((item) => item.type === 'video')).toBe(true);
      expect(items[0].metadata).toMatchObject({ mock: true, provider: 'youtube' });
    });

    it('un video accesible retorna 1 item', async () => {
      const items = await provider.fetchMetadata('https://www.youtube.com/watch?v=video.publico');
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('video');
    });

    it('video privado no retorna items (nunca se evaden privados)', async () => {
      const items = await provider.fetchMetadata('https://www.youtube.com/watch?v=private-video');
      expect(items).toHaveLength(0);
    });
  });

  describe('parseIsoDuration', () => {
    it('convierte duraciones ISO-8601 a segundos', () => {
      expect(parseIsoDuration('PT4M13S')).toBe(253);
      expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
      expect(parseIsoDuration(undefined)).toBeNull();
    });
  });
});
