import { BaseWorker } from './index';
import { readFileSync, existsSync } from 'fs';
import { supabase } from '@/lib/supabase';
import { uploadToStorage } from '@/lib/supabase/storage';
import { transcodeVideo, TranscodeResult } from '@/utils/ffmpeg';
import { errorFactory } from '@/utils/errors';

export interface TranscodePayload {
  mediaItemId: string;
  storagePath: string;
}

export interface TranscodeJobResult {
  success: boolean;
  mediaItemId: string;
  renditions: Array<{ resolution: string; url: string }>;
  thumbnailUrl: string | null;
  error?: string;
}

export class TranscodeWorker extends BaseWorker {
  readonly name = 'transcode';

  async run(payload: TranscodePayload): Promise<TranscodeJobResult> {
    const { mediaItemId, storagePath } = payload;

    try {
      const { data: mediaItem, error: fetchError } = await supabase
        .from('media_items')
        .select('*')
        .eq('id', mediaItemId)
        .single();

      if (fetchError || !mediaItem) {
        throw errorFactory({
          provider: null,
          status: 404,
          message: 'MediaItem no encontrado',
        });
      }

      const localPath = storagePath;
      if (!existsSync(localPath)) {
        throw errorFactory({
          provider: null,
          status: 404,
          message: 'Archivo no encontrado en storage local',
        });
      }

      const result: TranscodeResult = await transcodeVideo({ inputPath: localPath });

      const renditionUploads: Array<{ resolution: string; url: string }> = [];

      for (const rendition of result.renditions) {
        if (!existsSync(rendition.outputPath)) continue;

        const fileBuffer = readFileSync(rendition.outputPath);
        const uploadPath = `transcoded/${mediaItemId}/${rendition.resolution}.mp4`;

        const uploadResult = await uploadToStorage('transcoded', uploadPath, fileBuffer, 'video/mp4');

        renditionUploads.push({
          resolution: rendition.resolution,
          url: uploadResult.url,
        });
      }

      let thumbnailUrl: string | null = null;
      if (result.thumbnailPath && existsSync(result.thumbnailPath)) {
        const thumbBuffer = readFileSync(result.thumbnailPath);
        const thumbPath = `thumbnails/${mediaItemId}.webp`;

        const thumbResult = await uploadToStorage('thumbnails', thumbPath, thumbBuffer, 'image/webp');
        thumbnailUrl = thumbResult.url;
      }

      await supabase
        .from('media_items')
        .update({
          metadata: {
            ...mediaItem.metadata,
            renditions: renditionUploads,
            transcoded: true,
            duration: result.duration,
            width: result.width,
            height: result.height,
          },
          thumbnail_url: thumbnailUrl,
        })
        .eq('id', mediaItemId);

      return {
        success: true,
        mediaItemId,
        renditions: renditionUploads,
        thumbnailUrl,
      };
    } catch (error) {
      const appError = errorFactory({
        provider: null,
        status: 500,
        message: error instanceof Error ? error.message : 'Error en transcodificación',
        cause: error,
      });

      return {
        success: false,
        mediaItemId,
        renditions: [],
        thumbnailUrl: null,
        error: appError.message,
      };
    }
  }
}