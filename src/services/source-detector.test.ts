import { describe, it, expect } from 'vitest';
import { detectSource, normalizeSourceUrl } from './source-detector';
import type { SourceProvider, SourceContentType } from '@/types/source';

describe('normalizeSourceUrl', () => {
  it('quita trailing slash', () => {
    const result = normalizeSourceUrl('https://instagram.com/p/ABC123/');
    expect(result).toBe('https://instagram.com/p/ABC123');
  });

  it('quita parametros UTM', () => {
    const result = normalizeSourceUrl('https://instagram.com/p/ABC123?utm_source=instagram&utm_medium=web');
    expect(result).toBe('https://instagram.com/p/ABC123');
  });

  it('conserva parametros no-UTM', () => {
    const result = normalizeSourceUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share');
    expect(result).toContain('v=dQw4w9WgXcQ');
    expect(result).not.toContain('utm_');
  });

  it('agrega protocolo si falta', () => {
    const result = normalizeSourceUrl('instagram.com/p/ABC123');
    expect(result).toBe('https://instagram.com/p/ABC123');
  });

  it('quita hash', () => {
    const result = normalizeSourceUrl('https://instagram.com/p/ABC123#section');
    expect(result).not.toContain('#');
  });

  it('maneja URL vacia retornando unsupported', () => {
    const result = detectSource('');
    expect(result.provider).toBe('unsupported' as SourceProvider);
  });
});

describe('detectSource', () => {
  describe('Instagram', () => {
    it('detecta post de Instagram', () => {
      const result = detectSource('https://www.instagram.com/p/Cr5KJQvu1Hs/');
      expect(result.provider).toBe('instagram' as SourceProvider);
      expect(result.contentType).toBe('post' as SourceContentType);
      expect(result.identifier).toBe('Cr5KJQvu1Hs');
      expect(result.url).toBe('https://www.instagram.com/p/Cr5KJQvu1Hs');
      expect(result.originalUrl).toBe('https://www.instagram.com/p/Cr5KJQvu1Hs/');
    });

    it('detecta reel de Instagram', () => {
      const result = detectSource('https://instagram.com/reel/CxYz123abc/');
      expect(result.provider).toBe('instagram' as SourceProvider);
      expect(result.contentType).toBe('reel' as SourceContentType);
      expect(result.identifier).toBe('CxYz123abc');
    });

    it('detecta perfil de Instagram', () => {
      const result = detectSource('https://www.instagram.com/juanperez/');
      expect(result.provider).toBe('instagram' as SourceProvider);
      expect(result.contentType).toBe('profile' as SourceContentType);
      expect(result.identifier).toBe('juanperez');
    });

    it('detecta stories de Instagram', () => {
      const result = detectSource('https://instagram.com/stories/juanperez/123456789/');
      expect(result.provider).toBe('instagram' as SourceProvider);
      expect(result.contentType).toBe('profile' as SourceContentType);
      expect(result.identifier).toBe('juanperez');
    });

    it('normaliza URL con UTM de Instagram', () => {
      const result = detectSource('https://www.instagram.com/p/Cr5KJQvu1Hs/?utm_source=ig&utm_medium=web');
      expect(result.provider).toBe('instagram' as SourceProvider);
      expect(result.url).not.toContain('utm_');
      expect(result.identifier).toBe('Cr5KJQvu1Hs');
    });
  });

  describe('YouTube', () => {
    it('detecta video de YouTube (watch)', () => {
      const result = detectSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.provider).toBe('youtube' as SourceProvider);
      expect(result.contentType).toBe('video' as SourceContentType);
      expect(result.identifier).toBe('dQw4w9WgXcQ');
    });

    it('detecta video de YouTube (youtu.be)', () => {
      const result = detectSource('https://youtu.be/dQw4w9WgXcQ');
      expect(result.provider).toBe('youtube' as SourceProvider);
      expect(result.contentType).toBe('video' as SourceContentType);
      expect(result.identifier).toBe('dQw4w9WgXcQ');
    });

    it('detecta short de YouTube', () => {
      const result = detectSource('https://youtube.com/shorts/dQw4w9WgXcQ');
      expect(result.provider).toBe('youtube' as SourceProvider);
      expect(result.contentType).toBe('short' as SourceContentType);
      expect(result.identifier).toBe('dQw4w9WgXcQ');
    });

    it('detecta canal de YouTube (@usuario)', () => {
      const result = detectSource('https://www.youtube.com/@canaloficial');
      expect(result.provider).toBe('youtube' as SourceProvider);
      expect(result.contentType).toBe('profile' as SourceContentType);
      expect(result.identifier).toBe('canaloficial');
    });

    it('detecta canal de YouTube (/channel/)', () => {
      const result = detectSource('https://youtube.com/channel/UC1234567890ABC');
      expect(result.provider).toBe('youtube' as SourceProvider);
      expect(result.contentType).toBe('profile' as SourceContentType);
      expect(result.identifier).toBe('UC1234567890ABC');
    });

    it('detecta video de YouTube con parametros adicionales', () => {
      const result = detectSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s&feature=share');
      expect(result.provider).toBe('youtube' as SourceProvider);
      expect(result.contentType).toBe('video' as SourceContentType);
      expect(result.identifier).toBe('dQw4w9WgXcQ');
    });
  });

  describe('Facebook', () => {
    it('detecta video de Facebook (videos/)', () => {
      const result = detectSource('https://www.facebook.com/juanperez/videos/1234567890/');
      expect(result.provider).toBe('facebook' as SourceProvider);
      expect(result.contentType).toBe('video' as SourceContentType);
      expect(result.identifier).toBe('1234567890');
    });

    it('detecta video de Facebook (watch)', () => {
      const result = detectSource('https://www.facebook.com/watch/?v=987654321');
      expect(result.provider).toBe('facebook' as SourceProvider);
      expect(result.contentType).toBe('video' as SourceContentType);
      expect(result.identifier).toBe('987654321');
    });

    it('detecta video de Facebook (fb.watch)', () => {
      const result = detectSource('https://fb.watch/abc123def/');
      expect(result.provider).toBe('facebook' as SourceProvider);
      expect(result.contentType).toBe('video' as SourceContentType);
      expect(result.identifier).toBe('abc123def');
    });
  });

  describe('Unsupported', () => {
    it('detecta URL no soportada', () => {
      const result = detectSource('https://www.tiktok.com/@usuario/video/123456789');
      expect(result.provider).toBe('unsupported' as SourceProvider);
      expect(result.identifier).toBe('');
      expect(result.originalUrl).toBe('https://www.tiktok.com/@usuario/video/123456789');
    });

    it('detecta URL invalida', () => {
      const result = detectSource('not-a-valid-url');
      expect(result.provider).toBe('unsupported' as SourceProvider);
    });
  });

  describe('Consistencia', () => {
    it('siempre retorna un resultado (nunca null)', () => {
      const result = detectSource('cualquier-cosa');
      expect(result).toBeDefined();
      expect(result.provider).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.contentType).toBeDefined();
      expect(result.identifier).toBeDefined();
      expect(result.originalUrl).toBeDefined();
    });

    it('retiene la URL original en originalUrl', () => {
      const input = 'https://instagram.com/p/Cr5KJQvu1Hs/?utm_source=test';
      const result = detectSource(input);
      expect(result.originalUrl).toBe(input);
    });

    it('url normalizada no tiene trailing slash', () => {
      const result = detectSource('https://instagram.com/p/ABC123/');
      expect(result.url.endsWith('/')).toBe(false);
    });

    it('url normalizada no tiene parametros UTM', () => {
      const result = detectSource('https://youtube.com/watch?v=abc&utm_campaign=test');
      expect(result.url).not.toContain('utm_');
    });
  });
});
