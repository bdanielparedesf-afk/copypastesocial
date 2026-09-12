'use server';

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { jobQueue } from '@/workers';
import { errorFactory } from '@/utils/errors';

const PublishSchema = z.object({
  sourceId: z.string().uuid('ID de fuente inválido'),
  socialAccountId: z.string().uuid('ID de cuenta social inválido'),
  caption: z.string().max(5000, 'Máximo 5000 caracteres').default(''),
});

export interface PublishActionResponse {
  success: boolean;
  publicationId?: string;
  jobId?: string;
  error?: string;
}

export interface PublicationView {
  id: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  source: { originalUrl: string; provider: string } | null;
  socialAccount: { provider: string; username: string } | null;
  mediaItems: Array<{ url: string; thumbnailUrl: string | null; type: string }>;
}

async function currentUserId(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // sin sesión activa
  }
  return '00000000-0000-0000-0000-000000000000';
}

export async function createPublication(input: {
  sourceId: string;
  socialAccountId: string;
  caption?: string;
}): Promise<PublishActionResponse> {
  const parsed = PublishSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const { sourceId, socialAccountId, caption } = parsed.data;

  try {
    // Buscar media de la fuente (preferentemente transcodificado o video)
    const { data: mediaItems, error: mediaError } = await supabase
      .from('media_items')
      .select('id, type, metadata')
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (mediaError) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al buscar media: ${mediaError.message}`,
        body: mediaError,
      });
    }

    if (!mediaItems || mediaItems.length === 0) {
      return { success: false, error: 'La fuente no tiene contenido descargado. Descárgala primero.' };
    }

    const mediaItem =
      mediaItems.find((m) => {
        const metadata = (m.metadata as Record<string, unknown> | null);
        return m.type === 'video' && metadata?.transcoded === true;
      }) ??
      mediaItems.find((m) => m.type === 'video') ??
      mediaItems[0];

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
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al crear publicación: ${pubError?.message ?? 'Unknown'}`,
        body: pubError,
      });
    }

    const jobId = await jobQueue.createPublishJob(publication.id, {
      publicationId: publication.id,
      socialAccountId,
      mediaItemId: mediaItem.id,
      caption,
    });

    return { success: true, publicationId: publication.id, jobId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al crear publicación',
    };
  }
}
export async function getPublications(limit = 20): Promise<{
  success: boolean;
  publications?: PublicationView[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('publications')
      .select('id, caption, status, scheduled_at, created_at, source_id, social_account_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al obtener publicaciones: ${error.message}`,
        body: error,
      });
    }

    const publications = await Promise.all(
      (data ?? []).map(async (pub) => {
        const { data: sourceRows } = await supabase
          .from('sources')
          .select('original_url, provider')
          .eq('id', pub.source_id)
          .limit(1);

        const { data: accountRows } = await supabase
          .from('social_accounts')
          .select('provider, username')
          .eq('id', pub.social_account_id)
          .limit(1);

        const { data: mediaRows } = await supabase
          .from('media_items')
          .select('url, thumbnail_url, type')
          .eq('source_id', pub.source_id)
          .limit(1);

        const source = sourceRows?.[0];
        const account = accountRows?.[0];

        return {
          id: pub.id,
          caption: pub.caption,
          status: pub.status,
          scheduledAt: pub.scheduled_at,
          createdAt: pub.created_at,
          source: source ? { originalUrl: source.original_url, provider: source.provider } : null,
          socialAccount: account
            ? { provider: account.provider, username: account.username }
            : null,
          mediaItems: (mediaRows ?? []).map((m) => ({
            url: m.url,
            thumbnailUrl: m.thumbnail_url,
            type: m.type,
          })),
        };
      })
    );

    return { success: true, publications };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al obtener publicaciones',
    };
  }
}