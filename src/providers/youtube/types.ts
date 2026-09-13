/**
 * FASE 12 - Tipos para YouTube OAuth + Upload
 */

/**
 * Cuenta de YouTube conectada (datos almacenados en social_accounts).
 */
export interface YTAccount {
  /** ID único de la cuenta (channelId de YouTube) */
  id: string;
  /** Título del canal (ej: "Mi Canal de YouTube") */
  title: string;
  /** URL del avatar del canal */
  avatar: string | null;
}

/**
 * Video de YouTube listado desde la API.
 */
export interface YTVideo {
  /** ID del video (videoId) */
  id: string;
  /** Título del video */
  title: string;
  /** Descripción del video (primeros 500 chars para caption) */
  description: string | null;
  /** URL del thumbnail */
  thumbnail: string | null;
  /** Duración en formato ISO 8601 (ej: "PT1M30S") */
  duration: string | null;
  /** Duración en segundos (calculado desde duration) */
  durationSeconds: number | null;
  /** Fecha de publicación */
  publishedAt: string | null;
  /** Estado de privacidad */
  privacyStatus: string | null;
}

/**
 * Resultado de validación de archivo para upload.
 */
export interface VideoValidationResult {
  /** ¿Válido para subir? */
  valid: boolean;
  /** Mensaje de error si no es válido */
  error?: string;
  /** Tipo: 'short' (≤60s), 'normal' (≤15min), 'error' (>15min) */
  type: 'short' | 'normal' | 'error';
  /** Duración en segundos */
  durationSeconds: number;
  /** Tamaño en bytes */
  sizeBytes: number;
  /** Formato detectado */
  format: string;
}

/**
 * Metadatos para upload de video.
 */
export interface YouTubeUploadMetadata {
  /** Título del video */
  title: string;
  /** Descripción (caption) */
  description: string | null;
  /** Tags del video */
  tags: string[];
  /** Visibilidad (public, unlisted, private) */
  privacyStatus: 'public' | 'unlisted' | 'private';
  /** ¿Es Short? (duration ≤60s) */
  isShort: boolean;
}

/**
 * Resultado de upload (mock o real).
 */
export interface YouTubeUploadResult {
  /** ID externo del video en YouTube */
  external_id: string;
  /** Estado del upload */
  status: 'PROCESSING_EXTERNAL' | 'SUCCESS' | 'ERROR';
  /** Mensaje adicional */
  message?: string;
}
