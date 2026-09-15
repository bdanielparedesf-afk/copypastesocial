/**
 * FASE 23 — Tests de releaseMediaStorage (conteo de referencia).
 */
import { describe, expect, it, vi } from 'vitest';
import { releaseMediaStorage } from './cleanup';

function fakeDb(opts: {
  media?: { raw_path: string | null; processed_path: string | null };
  pendingJobs?: number;
  pendingQueue?: number;
}) {
  const removed: Array<{ bucket: string; path: string }> = [];
  const updated: Array<Record<string, unknown>> = [];
  const media = opts.media ?? { raw_path: 'u/1/a.mp4', processed_path: 'u/1/p.mp4' };
  const db = {
    from: (table: string) => {
      if (table === 'media_items') {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                updated.length > 0 && false
                  ? { data: null, error: null }
                  : { data: { id: 'm1', raw_url: null, processed_url: null, ...media }, error: null },
            }),
          }),
          update: (u: Record<string, unknown>) => ({
            eq: () => {
              updated.push(u);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'publication_jobs') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ count: opts.pendingJobs ?? 0, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({ count: opts.pendingQueue ?? 0, error: null }),
          }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, path: paths[0] });
          return { error: null };
        },
      }),
    },
  };
  return { db, removed, updated };
}

describe('releaseMediaStorage', () => {
  it('borra raw+processed y nullea paths cuando no hay pendientes', async () => {
    const { db, removed, updated } = fakeDb({});
    const r = await releaseMediaStorage(db as never, 'm1');
    expect(r.released).toBe(true);
    expect(removed).toHaveLength(2);
    expect(updated[0]).toMatchObject({ raw_path: null, processed_path: null });
  });

  it('NO borra si quedan jobs pendientes (multi-destino)', async () => {
    const { db, removed } = fakeDb({ pendingJobs: 3 });
    const r = await releaseMediaStorage(db as never, 'm1');
    expect(r.released).toBe(false);
    expect(r.reason).toContain('bloqueado');
    expect(removed).toHaveLength(0);
  });

  it('NO borra si queda cola legacy pendiente', async () => {
    const { db, removed } = fakeDb({ pendingQueue: 1 });
    const r = await releaseMediaStorage(db as never, 'm1');
    expect(r.released).toBe(false);
    expect(removed).toHaveLength(0);
  });

  it('sin paths retorna sin-paths sin llamar a storage', async () => {
    const { db, removed } = fakeDb({ media: { raw_path: null, processed_path: null } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await releaseMediaStorage(db as never, 'm1');
    expect(r.reason).toBe('sin-paths');
    expect(removed).toHaveLength(0);
    spy.mockRestore();
  });
});
