import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jobQueue } from '@/workers';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // sin sesión activa
  }
  return '00000000-0000-0000-0000-000000000000';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sourceId?: string;
      socialAccountId?: string;
      caption?: string;
    };

    const { sourceId, socialAccountId, caption = '' } = body;

    if (!sourceId || !socialAccountId) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos (sourceId, socialAccountId)' },
        { status: 400 }
      );
    }

    // El contenido de la fuente debe existir (media descargado / transcodificado)
    const { data: mediaItems, error: mediaError } = await supabase
      .from('media_items')
      .select('id, type')
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (mediaError) {
      return NextResponse.json(
        { success: false, error: mediaError.message },
        { status: 500 }
      );
    }

    if (!mediaItems || mediaItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'La fuente no tiene contenido descargado' },
        { status: 404 }
      );
    }

    const { data: publication, error: pubError } = await supabase
      .from('publications')
      .insert({
        user_id: await currentUserId(),
        source_id: sourceId,
        social_account_id: socialAccountId,
        caption,
        status: 'pending',
        scheduled_at: null,
      })
      .select('id')
      .single();

    if (pubError || !publication) {
      return NextResponse.json(
        { success: false, error: pubError?.message ?? 'Error al crear publicación' },
        { status: 500 }
      );
    }

    const jobId = await jobQueue.createPublishJob(publication.id, {
      publicationId: publication.id,
      socialAccountId,
      mediaItemId: mediaItems[0].id,
      caption,
    });

    return NextResponse.json({
      success: true,
      message: 'Publicación encolada',
      publicationId: publication.id,
      jobId,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}