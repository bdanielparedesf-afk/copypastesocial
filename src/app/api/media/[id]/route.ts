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

/* ------------------------------------------------------------------ */
/* FASE 17 — PATCH /api/media/[id]                                    */
/*                                                                    */
/* Actualiza los campos de IA de un media_item:                        */
/*   ai_generated_caption, ai_generated_title, ai_generated_hashtags   */
/*                                                                    */
/* Ownership: media_items -> sources.user_id (igual que GET).          */
/* ------------------------------------------------------------------ */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id debe ser un UUID válido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  const bg = body as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(bg, 'ai_generated_caption')) {
    const val = bg.ai_generated_caption;
    if (val !== null && typeof val !== 'string') {
      return NextResponse.json(
        { error: 'ai_generated_caption debe ser texto o null' },
        { status: 400 }
      );
    }
    update.ai_generated_caption = val;
  }

  if (Object.prototype.hasOwnProperty.call(bg, 'ai_generated_title')) {
    const val = bg.ai_generated_title;
    if (val !== null && typeof val !== 'string') {
      return NextResponse.json(
        { error: 'ai_generated_title debe ser texto o null' },
        { status: 400 }
      );
    }
    update.ai_generated_title = val;
  }

  if (Object.prototype.hasOwnProperty.call(bg, 'ai_generated_hashtags')) {
    const val = bg.ai_generated_hashtags;
    if (val !== null && !Array.isArray(val)) {
      return NextResponse.json(
        { error: 'ai_generated_hashtags debe ser un array o null' },
        { status: 400 }
      );
    }
    update.ai_generated_hashtags = val;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'No se proporcionaron campos para actualizar' },
      { status: 400 }
    );
  }

  const { data: item, error } = await supabase
    .from('media_items')
    .update(update)
    .eq('id', id)
    .select('id, sources!inner(user_id)')
    .single();

  if (error || !item) {
    return NextResponse.json(
      { error: 'media_item no encontrado o sin permisos' },
      { status: 404 }
    );
  }

  const sources = item?.sources as unknown;
  const sourceOwner = Array.isArray(sources)
    ? (sources[0] as { user_id?: string } | undefined)?.user_id
    : (sources as { user_id?: string } | undefined)?.user_id;

  if (sourceOwner !== user.id) {
    return NextResponse.json(
      { error: 'media_item no encontrado o sin permisos' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, id });
}
