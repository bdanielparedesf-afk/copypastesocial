export type SocialSourceProvider = 'instagram' | 'youtube' | 'facebook';

/** Todos los valores aceptados en `sources.provider` (incluye uploads locales). */
export type SourceProvider = SocialSourceProvider | 'local' | 'upload' | 'direct' | 'unsupported';

export type SourceContentType = 'profile' | 'post' | 'reel' | 'short' | 'video';

export interface SourceDetectionResult {
  /** El detector solo resuelve plataformas sociales por URL (o 'unsupported'). */
  provider: SocialSourceProvider | 'unsupported';
  url: string;
  contentType: SourceContentType;
  identifier: string;
  originalUrl: string;
}
