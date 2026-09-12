/**
 * FASE 8 — GET /api/media/[id]
 *
 * Retorna el media_item con URLs firmadas: raw_url y processed_url se firman
 * (1h) cuando apuntan a los buckets 'raw'/'processed' de Supabase Storage;
 * URLs externas se retornan tal cual.
 *
 * Ownership: media_items -> sources.user_id (igual que la política RLS).
 */
import { NextRequest, NextResponse } from 'next/server';

import { extractStoragePath, getSignedUrl } from '@/lib/storage/storage';
import { supabase } from '@/lib/supabase';

/** Validez de las URLs firmadas: 1 hora. */
const SIGNED_URL_EXPIRES_IN = 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Firma la URL si apunta a Storage (buckets raw/processed); si es externa
 * (CDN de la plataforma) se retorna tal cual; si falla la firma, fallback
 * a la URL original para no romper la respuesta.
 */
async function toSignedUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  const ref = extractStoragePath(url);
  if (!ref) return url;

  try {
    return await getSignedUrl(ref.bucket, ref.path, SIGNED_URL_EXPIRES_IN);
  } catch {
    return url;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1) Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 2) Validación UUID del path param
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id debe ser un UUID válido' }, { status: 400 });
  }

  // 3) Cargar el item y validar ownership (sources.user_id = auth user)
  const { data: item, error } = await supabase
    .from('media_items')
    .select('*, sources!inner(user_id)')
    .eq('id', id)
    .single();

  // Embed 'sources': objeto en runtime (FK many-to-one + !inner), pero
  // normalizado por si acaso postgrest-js lo trae como array.
  const sources = item?.sources as unknown;
  const sourceOwner = Array.isArray(sources)
    ? (sources[0] as { user_id?: string } | undefined)?.user_id
    : (sources as { user_id?: string } | undefined)?.user_id;

  if (error || !item || sourceOwner !== user.id) {
    return NextResponse.json(
      { error: 'media_item no encontrado o sin permisos' },
      { status: 404 }
    );
  }

  // Quitar el join interno del payload y firmar las URLs de Storage.
  const mediaItem: Record<string, unknown> = { ...item };
  delete mediaItem.sources;

  mediaItem.raw_signed_url = await toSignedUrl(mediaItem.raw_url as string | null);
  mediaItem.processed_signed_url = await toSignedUrl(mediaItem.processed_url as string | null);

  return NextResponse.json({ mediaItem });
}
