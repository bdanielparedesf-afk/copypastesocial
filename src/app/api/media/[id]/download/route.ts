/**
 * FASE 18 — GET /api/media/[id]/download
 *
 * Sirve el archivo local directamente (sin Supabase Storage).
 * Para media_items con source_provider='local', extrae el data URL
 * y devuelve el archivo binario con el Content-Type correcto.
 *
 * Esto permite que los providers de publicación (Instagram, Facebook, etc.)
 * puedan descargar el archivo desde una URL accesible.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1) Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 2) Validación UUID
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id debe ser un UUID válido' }, { status: 400 });
  }

  // 3) Cargar el item y validar ownership
  const { data: item, error } = await supabase
    .from('media_items')
    .select('*, sources!inner(user_id)')
    .eq('id', id)
    .single();

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

  // 4) Solo para archivos locales
  if (item.source_provider !== 'local') {
    return NextResponse.json(
      { error: 'Este endpoint es solo para archivos locales' },
      { status: 400 }
    );
  }

  // 5) Extraer datos del data URL
  const dataUrl = item.url as string;
  if (!dataUrl.startsWith('data:')) {
    return NextResponse.json(
      { error: 'URL de archivo local inválida' },
      { status: 500 }
    );
  }

  // Parsear data URL: data:[<mediatype>][;base64],<data>
  const commaIndex = dataUrl.indexOf(',');
  const meta = dataUrl.substring(5, commaIndex); // ej: "video/mp4;base64"
  const base64Data = dataUrl.substring(commaIndex + 1);

  const isBase64 = meta.includes(';base64');
  const mimeType = meta.split(';')[0] || 'application/octet-stream';

  let fileBuffer: Buffer;
  if (isBase64) {
    fileBuffer = Buffer.from(base64Data, 'base64');
  } else {
    fileBuffer = Buffer.from(decodeURIComponent(base64Data), 'utf-8');
  }

  // 6) Devolver el archivo con headers correctos
  const fileName = (item.metadata as Record<string, unknown>)?.original_filename as string || `media-${id}`;
  const encodedFileName = encodeURIComponent(fileName);

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': fileBuffer.length.toString(),
      'Content-Disposition': `attachment; filename="${encodedFileName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
