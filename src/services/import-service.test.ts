/**
 * FASE 6 — Tests de import-service con MOCK_MODE=true y store en memoria.
 * Valida: checkSource (mensajes humanos) e importFromSource con la dedup
 * OBLIGATORIA por external_id / source_url normalizada / content_hash.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  importFromSource,
  checkSource,
  contentHashFor,
  type SourceStore,
  type SourceRow,
  type MediaRow,
  type DuplicateReason,
} from './import-service';
import type { MediaItem } from '@/providers/interface';

const USER_ID = '00000000-0000-0000-0000-000000000001';

/** Store en memoria que replica el contrato de persistencia. */
class MemoryStore implements SourceStore {
  sources: SourceRow[] = [];
  media: Array<MediaRow & { type: string; url: string }> = [];
  private seq = 0;

  async findSourceByUserAndUrl(userId: string, normalizedUrl: string): Promise<SourceRow | null> {
    return (
      this.sources.find((s) => s.user_id === userId && s.normalized_url === normalizedUrl) ?? null
    );
  }

  async createSource(input: Parameters<SourceStore['createSource']>[0]): Promise<SourceRow | null> {
    const row: SourceRow = {
      id: `src-${++this.seq}`,
      user_id: input.userId,
      original_url: input.originalUrl,
      normalized_url: input.normalizedUrl,
      provider: input.provider,
      identifier: input.identifier,
      content_type: input.contentType,
      status: input.status,
    };
    this.sources.push(row);
    return row;
  }

  async findMediaByExternalIds(userId: string, externalIds: string[]): Promise<MediaRow[]> {
    return this.media.filter(
      (m) => m.external_id !== null && externalIds.includes(m.external_id) && this.ownedBy(m, userId)
    );
  }

  async findMediaByUrls(userId: string, urls: string[]): Promise<MediaRow[]> {
    return this.media.filter(
      (m) => m.source_url !== null && urls.includes(m.source_url) && this.ownedBy(m, userId)
    );
  }

  async findMediaByHashes(userId: string, hashes: string[]): Promise<MediaRow[]> {
    return this.media.filter(
      (m) => m.content_hash !== null && hashes.includes(m.content_hash) && this.ownedBy(m, userId)
    );
  }

  async insertMediaItems(
    sourceId: string,
    rows: Array<{ externalId: string | null; sourceUrl: string; contentHash: string; item: MediaItem }>
  ) {
    return rows.map((row) => {
      const id = `mi-${++this.seq}`;
      this.media.push({
        id,
        external_id: row.externalId,
        source_url: row.sourceUrl,
        content_hash: row.contentHash,
        source_id: sourceId,
        type: row.item.type,
        url: row.item.url,
      });
      return { id, url: row.item.url, type: row.item.type };
    });
  }

  private ownedBy(row: MediaRow, userId: string): boolean {
    const source = this.sources.find((s) => s.id === row.source_id);
    return source?.user_id === userId;
  }
}

function seedSource(userId: string, provider: 'youtube' | 'instagram' | 'facebook', identifier: string): SourceRow {
  return {
    id: 'src-existing',
    user_id: userId,
    original_url: `https://www.${provider}.com/${identifier}`,
    normalized_url: null,
    provider,
    identifier,
    content_type: 'profile',
    status: 'ACCESSIBLE',
  };
}

describe('import-service (MOCK_MODE=true)', () => {
  let store: MemoryStore;

  beforeEach(() => {
    vi.stubEnv('MOCK_MODE', 'true');
    store = new MemoryStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('checkSource', () => {
    it('canal de YouTube público → ACCESSIBLE + "12 videos encontrados"', async () => {
      const result = await checkSource('https://www.youtube.com/@canal.publico');
      expect(result.provider).toBe('youtube');
      expect(result.accessibility).toBe('ACCESSIBLE');
      expect(result.mediaCount).toBe(12);
      expect(result.message).toBe('12 videos encontrados');
    });

    it('perfil de Instagram público → "12 publicaciones encontradas"', async () => {
      const result = await checkSource('https://www.instagram.com/usuario.publico/');
      expect(result.provider).toBe('instagram');
      expect(result.accessibility).toBe('ACCESSIBLE');
      expect(result.mediaCount).toBe(12);
      expect(result.message).toBe('12 publicaciones encontradas');
    });

    it('perfil privado → mensaje humano de privado', async () => {
      const result = await checkSource('https://www.instagram.com/usuario.private/');
      expect(result.accessibility).toBe('PRIVATE');
      expect(result.message).toBe('Este perfil es privado, no podemos acceder sin autorización.');
    });

    it('YouTube auth → "Necesitas conectar tu cuenta de YouTube."', async () => {
      const result = await checkSource('https://www.youtube.com/watch?v=auth-required-video');
      expect(result.accessibility).toBe('AUTH_REQUIRED');
      expect(result.message).toBe('Necesitas conectar tu cuenta de YouTube.');
    });

    it('cuota → API_RESTRICTED con mensaje humano', async () => {
      const result = await checkSource('https://www.youtube.com/watch?v=quota-video');
      expect(result.accessibility).toBe('API_RESTRICTED');
      expect(result.message).toContain('GOOGLE_API_KEY');
    });

    it('plataforma no soportada → UNSUPPORTED', async () => {
      const result = await checkSource('https://www.tiktok.com/@usuario/video/123');
      expect(result.provider).toBe('unsupported');
      expect(result.accessibility).toBe('UNSUPPORTED');
      expect(result.mediaCount).toBe(0);
      expect(result.message).toContain('no soportada');
    });

    it('URL se normaliza (sin UTM ni trailing slash)', async () => {
      const result = await checkSource('https://www.youtube.com/@canal.publico?utm_source=x');
      expect(result.url).toBe('https://www.youtube.com/@canal.publico');
    });
  });

  describe('importFromSource — importación y dedup', () => {
    it('importa un canal público completo (12 items)', async () => {
      const result = await importFromSource('https://www.youtube.com/@canal.publico', USER_ID, store);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('youtube');
      expect(result.imported).toBe(12);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.persisted).toBe(true);
      expect(result.alreadyImported).toBe(false);
      expect(result.sourceId).toMatch(/^src-/);
      expect(result.mediaItems).toHaveLength(12);
      expect(result.message).toBe('12 videos encontrados');
      expect(store.sources).toHaveLength(1);
      expect(store.media).toHaveLength(12);
    });

    it('NO re-importa: segunda vez retorna el existente (dedup por external_id)', async () => {
      await importFromSource('https://www.youtube.com/@canal.publico', USER_ID, store);
      const result = await importFromSource('https://www.youtube.com/@canal.publico?utm_source=repost', USER_ID, store);

      expect(result.success).toBe(true);
      expect(result.alreadyImported).toBe(true);
      expect(result.imported).toBe(0);
      expect(result.duplicatesSkipped).toBe(12);
      expect(result.duplicates.every((d) => d.reason === ('external_id' as DuplicateReason))).toBe(true);
      expect(result.message).toContain('ya estaba importado');
      expect(store.sources).toHaveLength(1);
      expect(store.media).toHaveLength(12);
    });

    it('dedup por source_url normalizada', async () => {
      store.sources.push(seedSource(USER_ID, 'youtube', 'canal.publico'));
      store.media.push({
        id: 'mi-existing',
        external_id: null,
        source_url: 'https://mock.copypastesocial.local/youtube/canal.publico/item/1',
        content_hash: null,
        source_id: 'src-existing',
        type: 'video',
        url: 'https://mock.copypastesocial.local/youtube/canal.publico/item/1',
      });

      const result = await importFromSource('https://www.youtube.com/@canal.publico', USER_ID, store);
      expect(result.imported).toBe(11);
      expect(result.duplicatesSkipped).toBe(1);
      expect(result.duplicates[0]).toMatchObject({ reason: 'source_url' });
    });

    it('dedup por content_hash', async () => {
      // Hash con la identidad COMPLETA del item mock #2 (incluye su externalId,
      // que aquí se deja null en la fila sembrada para forzar el match por hash).
      const hash = await contentHashFor('youtube', {
        externalId: 'mock-youtube-canal.publico-2',
        url: 'https://mock.copypastesocial.local/youtube/canal.publico/item/2',
        title: null,
        thumbnailUrl: null,
        type: 'video',
        duration: null,
        width: null,
        height: null,
        publishedAt: null,
        metadata: {},
      });
      store.sources.push(seedSource(USER_ID, 'youtube', 'canal.publico'));
      store.media.push({
        id: 'mi-existing',
        external_id: null,
        source_url: null,
        content_hash: hash,
        source_id: 'src-existing',
        type: 'video',
        url: 'otro-origen',
      });

      const result = await importFromSource('https://www.youtube.com/@canal.publico', USER_ID, store);
      expect(result.imported).toBe(11);
      expect(result.duplicatesSkipped).toBe(1);
      expect(result.duplicates[0]).toMatchObject({ reason: 'content_hash' });
    });

    it('fuente privada → NO importa nada', async () => {
      const result = await importFromSource('https://www.youtube.com/watch?v=private-video', USER_ID, store);
      expect(result.success).toBe(false);
      expect(result.accessibility).toBe('PRIVATE');
      expect(result.persisted).toBe(false);
      expect(result.sourceId).toBeNull();
      expect(store.sources).toHaveLength(0);
      expect(store.media).toHaveLength(0);
    });

    it('plataforma no soportada → no importa', async () => {
      const result = await importFromSource('https://www.tiktok.com/@usuario/video/123', USER_ID, store);
      expect(result.success).toBe(false);
      expect(result.accessibility).toBe('UNSUPPORTED');
      expect(store.sources).toHaveLength(0);
    });
  });

  describe('contentHashFor', () => {
    it('es determinista y distingue items distintos', async () => {
      const base: MediaItem = {
        externalId: 'abc',
        url: 'https://mock.copypastesocial.local/youtube/x/item/1',
        title: null,
        thumbnailUrl: null,
        type: 'video',
        duration: null,
        width: null,
        height: null,
        publishedAt: null,
        metadata: {},
      };
      const hash1 = await contentHashFor('youtube', base);
      const hash2 = await contentHashFor('youtube', base);
      const hash3 = await contentHashFor('youtube', { ...base, externalId: 'xyz' });
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});

