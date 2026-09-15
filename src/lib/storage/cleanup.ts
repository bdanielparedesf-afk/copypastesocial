/**
 * FASE 23 — Liberacion de Storage tras publicar (pass-through).
 * Buckets raw/processed son transito: navegador -> raw -> FFmpeg ->
 * processed -> Meta -> BORRAR via Storage API (from().remove()).
 * DELETE SQL directo deja el fisico huerfano en S3: no usar.
 */
import { extractStoragePath } from './storage';

type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

export interface ReleaseResult {
  released: boolean;
  reason: string;
  removedRaw: boolean;
  removedProcessed: boolean;
}

/** Estados que significan "este media todavia se necesita". */
const BLOCKING = ['pending', 'processing', 'uploading', 'publishing', 'retrying'];

function noop(reason: string): ReleaseResult {
  return { released: false, reason, removedRaw: false, removedProcessed: false };
}

/**
 * Libera el fisico de un media_item SOLO si ningun otro job lo necesita
 * (un media se publica a 4 destinos: borrar tras el 1er exito romperia
 * los 3 restantes). Nunca lanza: best-effort, no rompe el publish.
 */
export async function releaseMediaStorage(
  supabase: SupabaseLike,
  mediaId: string,
): Promise<ReleaseResult> {
  try {
    const { data: media, error: mediaError } = await supabase
      .from('media_items')
      .select('id, raw_path, processed_path, raw_url, processed_url')
      .eq('id', mediaId)
      .single();
    if (mediaError || !media) return noop('media-no-encontrado');

    const rawPath: string | null = (media.raw_path as string | null) ?? null;
    const processedPath: string | null = (media.processed_path as string | null) ?? null;
    if (!rawPath && !processedPath) {
      const a = extractStoragePath((media.raw_url as string | null) ?? null);
      const b = extractStoragePath((media.processed_url as string | null) ?? null);
      if (!a && !b) return noop('sin-paths');
    }

    // Conteo de referencia: publication_jobs pendientes del media.
    const { count: pendingJobs, error: jobsError } = await supabase
      .from('publication_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('media_id', mediaId)
      .in('status', BLOCKING);
    if (jobsError) return noop('jobs-check-fallo:' + jobsError.message);
    if ((pendingJobs ?? 0) > 0) return noop('bloqueado:quedan-' + pendingJobs + '-jobs');

    // Cola legacy publish_queue (IG directo) tambien bloquea.
    try {
      const { count: q } = await supabase
        .from('publish_queue')
        .select('id', { count: 'exact', head: true })
        .eq('media_id', mediaId)
        .in('status', ['PENDING', 'SCHEDULED', 'PUBLISHING']);
      if ((q ?? 0) > 0) return noop('bloqueado:quedan-' + q + '-en-cola');
    } catch {
      // Tabla inexistente: no bloquea.
    }

    let removedRaw = false;
    let removedProcessed = false;
    if (rawPath) {
      const { error } = await supabase.storage.from('raw').remove([rawPath]);
      if (!error || /not.?found|does.?not.?exist/i.test(error.message ?? '')) {
        removedRaw = true;
      } else {
        console.error('[cleanup] no se pudo borrar raw/' + rawPath + ':', error.message);
      }
    } else {
      removedRaw = true;
    }
    if (processedPath) {
      const { error } = await supabase.storage.from('processed').remove([processedPath]);
      if (!error || /not.?found|does.?not.?exist/i.test(error.message ?? '')) {
        removedProcessed = true;
      } else {
        console.error('[cleanup] no se pudo borrar processed/' + processedPath + ':', error.message);
      }
    } else {
      removedProcessed = true;
    }

    // Limpia refs en DB (paths a null, URLs se conservan como historial).
    try {
      const { data: current } = await supabase
        .from('media_items')
        .select('metadata')
        .eq('id', mediaId)
        .single();
      await supabase
        .from('media_items')
        .update({
          raw_path: null,
          processed_path: null,
          metadata: {
            ...((current?.metadata as Record<string, unknown>) ?? {}),
            storage_released: true,
            storage_released_at: new Date().toISOString(),
          },
        })
        .eq('id', mediaId);
    } catch (dbError) {
      console.error('[cleanup] no se pudo limpiar refs en media_items:', dbError);
    }

    const released = removedRaw && removedProcessed;
    return { released, reason: released ? 'liberado' : 'borrado-parcial', removedRaw, removedProcessed };
  } catch (error) {
    console.error('[cleanup] releaseMediaStorage fallo:', error);
    return noop(error instanceof Error ? error.message : 'error-desconocido');
  }
}

