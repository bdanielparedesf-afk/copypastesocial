export type SourceProvider = 'instagram' | 'youtube' | 'facebook' | 'unsupported';

export type SourceContentType = 'profile' | 'post' | 'reel' | 'short' | 'video';

export interface SourceDetectionResult {
  provider: SourceProvider;
  url: string;
  contentType: SourceContentType;
  identifier: string;
  originalUrl: string;
}
