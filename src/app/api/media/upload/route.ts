/**
 * FASE 18 — POST /api/media/upload
 * Subida de archivos locales (sin Supabase Storage).
 *
 * Recibe multipart/form-data con uno o más archivos.
 * - Crea un source con provider='local'
 * - Crea media_items con source_provider='local' y la URL como data: URL
 * - NO usa supabase.storage (todo en memoria/BD)
 *
 * Body: FormData con campo 'files' (uno o más File)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Parsear FormData
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron archivos' }, { status: 400 });
    }

    // Validar que sean archivos
    const validFiles: File[] = [];
    for (const file of files) {
      if (file instanceof File && file.size > 0) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      return NextResponse.json({ error: 'Archivos inválidos' }, { status: 400 });
    }

    // Tamaño máximo: 100MB por archivo
    const MAX_SIZE = 100 * 1024 * 1024;
    const oversized = validFiles.find((f) => f.size > MAX_SIZE);
    if (oversized) {
      return NextResponse.json(
        { error: `Archivo demasiado grande: ${oversized.name} (máx 100MB)` },
        { status: 400 }
      );
    }

    // Crear source con provider='local'
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .insert({
        user_id: user.id,
        original_url: `local://${validFiles[0].name}`,
        provider: 'local',
        identifier: `local_${Date.now()}`,
        content_type: 'video',
        status: 'ACCESSIBLE',
      })
      .select()
      .single();

    if (sourceError || !source) {
      return NextResponse.json(
        { error: `Error al crear source: ${sourceError?.message ?? 'sin datos'}` },
        { status: 500 }
      );
    }

    // Procesar cada archivo
    const mediaItems = [];
    for (const file of validFiles) {
      // Leer el archivo como ArrayBuffer y convertir a base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      // Determinar tipo MIME
      const mimeType = file.type || 'application/octet-stream';
      const isVideo = mimeType.startsWith('video/');
      const isImage = mimeType.startsWith('image/');

      // Construir data URL (se guarda en media_items.url)
      const dataUrl = `data:${mimeType};base64,${base64}`;

      // Determinar tipo de contenido
      const contentType = isVideo ? 'video' : isImage ? 'image' : 'video';

      // Crear thumbnail (para imágenes usamos el mismo data URL)
      const thumbnailUrl = isImage ? dataUrl : null;

      // Crear media_item
      const { data: mediaItem, error: mediaError } = await supabase
        .from('media_items')
        .insert({
          source_id: source.id,
          url: dataUrl,
          thumbnail_url: thumbnailUrl,
          type: contentType,
          source_provider: 'local',
          metadata: {
            original_filename: file.name,
            size: file.size,
            mime_type: mimeType,
            uploaded_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (mediaError || !mediaItem) {
        console.error(`Error al crear media_item para ${file.name}:`, mediaError);
        continue;
      }

      mediaItems.push({
        id: mediaItem.id,
        url: mediaItem.url,
        thumbnailUrl: mediaItem.thumbnail_url,
        type: mediaItem.type,
        sourceProvider: 'local',
        metadata: mediaItem.metadata,
      });
    }

    return NextResponse.json({
      success: true,
      sourceId: source.id,
      imported: mediaItems.length,
      mediaItems,
    });
  } catch (error) {
    console.error('Error en POST /api/media/upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al procesar la subida' },
      { status: 500 }
    );
  }
}
