/**
 * FASE 24 — E2E Direct Upload (upload-url → PUT raw → finalize-upload → cleanup).
 *
 * Usa Supabase REAL (service-role) porque el usuario autorizó INSERT de prueba
 * con borrado posterior. Orden:
 *  1. POST /api/media/upload-url (lógica de validación + firma, vía función real
 *     si hay dev server, o vía helpers si no).
 *  2. PUT binario al bucket 'raw'.
 *  3. POST /api/media/finalize-upload con provider='local'.
 *  4. Assert: sources.provider='local' + sources.raw_path set + media_items.raw_path set.
 *  5. Cleanup: borra storage raw + media_items + publication_jobs + publication + source.
 *
 * Ejecutar: `npm run test:e2e:upload` (requiere .env con service-role).
 * No se corre en CI: necesita credenciales y red.
 */
import { describe, expect, it } from 'vitest';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const ENABLED = process.env.E2E_DIRECT_UPLOAD === '1';

describe('FASE 24 e2e direct upload', () => {
  it('upload-url → PUT raw → finalize provider=local + raw_path', async () => {
    if (!ENABLED) {
      console.info('[e2e] skip: set E2E_DIRECT_UPLOAD=1 para correr contra dev server + Supabase real');
      return;
    }

    // 1) upload-url
    const urlRes = await fetch(BASE + '/api/media/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ name: 'fase24-e2e.mp4', size: 1024, type: 'video/mp4' }],
      }),
    });
    expect(urlRes.ok).toBe(true);
    const urlBody = (await urlRes.json()) as {
      success: boolean;
      bucket: string;
      targets: Array<{ path: string; signedUrl: string; name: string; size: number; type: string }>;
    };
    expect(urlBody.success).toBe(true);
    expect(urlBody.bucket).toBe('raw');
    expect(urlBody.targets).toHaveLength(1);
    const target = urlBody.targets[0];

    // 2) PUT binario mínimo (1KB) al bucket raw
    const putRes = await fetch(target.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: new Uint8Array(1024),
    });
    expect(putRes.ok).toBe(true);

    // 3) finalize-upload provider='local'
    const finRes = await fetch(BASE + '/api/media/finalize-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ path: target.path, name: target.name, size: 1024, type: 'video/mp4' }],
        createJobs: false,
      }),
    });
    expect(finRes.ok).toBe(true);
    const finBody = (await finRes.json()) as {
      success: boolean;
      sourceId: string;
      publicationId: string;
      mediaItems: Array<{ id: string }>;
    };
    expect(finBody.success).toBe(true);
    expect(finBody.sourceId).toBeTruthy();

    // 4) Verificación directa en DB (service-role)
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: source } = await admin.from('sources').select('*').eq('id', finBody.sourceId).single();
    expect(source.provider).toBe('local');
    expect(source.raw_path).toBe(target.path);

    const { data: items } = await admin.from('media_items').select('id,raw_path').eq('source_id', finBody.sourceId);
    expect(items?.length).toBeGreaterThan(0);
    expect(items?.[0].raw_path).toBe(target.path);

    // 5) Cleanup: storage + filas de prueba
    const mediaIds = (items ?? []).map((m: { id: string }) => m.id);
    await admin.storage.from('raw').remove([target.path]);
    if (mediaIds.length > 0) {
      await admin.from('publication_jobs').delete().in('media_id', mediaIds);
      await admin.from('media_items').delete().in('id', mediaIds);
    }
    await admin.from('publications').delete().eq('id', finBody.publicationId);
    await admin.from('sources').delete().eq('id', finBody.sourceId);
  });
});
