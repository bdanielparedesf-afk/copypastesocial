/**
 * FASE 18.2 — POST /api/media/upload-local [DEPRECADO — FASE 21]
 *
 * Subida de archivos locales (sin Supabase Storage) que además crea
 * publication_jobs en 'pending' para los 4 destinos (IG, YT, FB, TT).
 *
 * DEPRECADO: Vercel limita el body de las Functions a 4.5MB
 * (FUNCTION_PAYLOAD_TOO_LARGE). Esta ruta responde 413 a propósito para
 * guiar al cliente al flujo directo:
 *   POST /api/media/upload-url (JSON) -> PUT directo a Storage -> POST /api/media/finalize-upload
 * Se mantiene solo como guarda de compatibilidad; el frontend ya usa
 * uploadFilesDirect() y nunca llama aquí con binarios.
 *
 * Body legacy: FormData con campo 'files' (uno o más File)
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  // FASE 21 — Ruta vieja deshabilitada a propósito: el binario por la
  // Function revienta el límite de 4.5MB de Vercel. Usar flujo directo.
  return NextResponse.json(
    {
      error: 'use direct upload',
      message:
        'Esta ruta ya no acepta archivos. Usa POST /api/media/upload-url -> PUT directo a Storage -> POST /api/media/finalize-upload.',
    },
    { status: 413 }
  );
  /*
  try {
    // Single-owner: nunca 401 (la app no tiene login propio).
    const userId = await getUserIdAllowDev(request);
    const supabase = createServerClient();

    // Parsear FormData
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron archivos' }, { status: 400 });
    }

    // FASE 20: Validación de cantidad y tamaño
    if (files.length > 50) {
      return NextResponse.json(
        { error: 'Max 50 por tanda (sube 1000 en 20 tandas)' },
        { status: 400 }
      );
    }

    let totalSize = 0;
    for (const file of files) {
      if (file instanceof File) totalSize += file.size;
    }
    if (totalSize > 500 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Max 500MB por tanda' },
        { status: 400 }
      );
    }

    // Validar que sean archivos (FASE 20: skip non-video)
    const validFiles: File[] = [];
    for (const file of files) {
      if (file instanceof File && file.size > 0) {
        if (!file.type.startsWith('video/')) continue;
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
        user_id: userId,
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

    // Crear publication base (status='processing')
    const { data: publication, error: pubError } = await supabase
      .from('publications')
      .insert({
        user_id: userId,
        source_id: source.id,
        caption: '',
        status: 'processing',
      })
      .select()
      .single();

    if (pubError || !publication) {
      return NextResponse.json(
        { error: `Error al crear publicación: ${pubError?.message ?? 'sin datos'}` },
        { status: 500 }
      );
    }

    // Procesar cada archivo
    const mediaItems = [];
    let totalJobs = 0;

    for (const file of validFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = file.type || 'application/octet-stream';
      const isVideo = mimeType.startsWith('video/');
      const isImage = mimeType.startsWith('image/');
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const contentType = isVideo ? 'video' : isImage ? 'image' : 'video';
      const thumbnailUrl = isImage ? dataUrl : null;

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

      // Crear 4 publication_jobs en 'pending' (uno por destino)
      for (const provider of DESTINATIONS) {
        const { error: jobError } = await supabase.from('publication_jobs').insert({
          publication_id: publication.id,
          media_id: mediaItem.id,
          social_account_id: null,
          provider,
          source_provider: 'local',
          // Columnas obligatorias del esquema base de publication_jobs.
          type: 'publish',
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
          payload: {
            original_filename: file.name,
            auto_created: true,
          },
        });

        if (jobError) {
          console.error(`Error al crear job para ${provider}:`, jobError);
        } else {
          totalJobs++;
        }
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
      publicationId: publication.id,
      sourceId: source.id,
      imported: mediaItems.length,
      jobsCreated: totalJobs,
      destinations: [...DESTINATIONS],
      mediaItems,
    });
  } catch (error) {
    console.error('Error en POST /api/media/upload-local:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al procesar la subida' },
      { status: 500 }
    );
  }
  */
}
