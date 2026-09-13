/**
 * FASE 6 — Contrato de Source Providers (importación de contenido).
 *
 * REGLA DE SEGURIDAD #46 (obligatoria):
 * - Solo APIs oficiales (Graph API de Meta, YouTube Data API v3 de Google).
 * - NUNCA scraping evasivo, bypass de CAPTCHA/login/contenido privado,
 *   robo de cookies/sesiones, evasión de rate limits ni ocultar automatización.
 * - Contenido privado → se reporta PRIVATE / AUTH_REQUIRED. Nunca se intenta acceder.
 *
 * Este módulo es puro (sin dependencias de Node ni Supabase) para poder
 * importarse tanto en el servidor como en componentes cliente (Dashboard).
 */
import type { SourceProvider as SourceProviderId, SourceContentType } from '@/types/source';

/** Nombres de plataforma que tienen un SourceProvider implementado. */
export type SourceProviderName = Exclude<SourceProviderId, 'unsupported'>;

/**
 * Resultado de la verificación de accesibilidad de una fuente.
 * (Nota: CHECKING es un estado exclusivo de la UI, no del provider.)
 */
export type SourceAccessibility =
  | 'ACCESSIBLE'
  | 'PRIVATE'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'AUTH_REQUIRED'
  | 'API_RESTRICTED'
  | 'ERROR';

/** Mensajes humanos por defecto (se refinan por provider y por contexto). */
export const HUMAN_ACCESSIBILITY_MESSAGES: Record<SourceAccessibility, string> = {
  ACCESSIBLE: 'El contenido es público y podemos importarlo.',
  PRIVATE: 'Este perfil es privado, no podemos acceder sin autorización.',
  UNAVAILABLE: 'El contenido no está disponible o fue eliminado.',
  UNSUPPORTED: 'Esta plataforma todavía no está soportada.',
  AUTH_REQUIRED: 'Necesitas conectar tu cuenta para acceder a este contenido.',
  API_RESTRICTED: 'La API de esta plataforma restringió la consulta. Intenta de nuevo más tarde.',
  ERROR: 'Ocurrió un error al consultar la plataforma.',
};

/**
 * Item multimedia candidato (aún NO persistido).
 * El import-service lo mapea a filas de la tabla `media_items`.
 */
export interface MediaItem {
  /** ID del contenido en la plataforma de origen (para dedup por external_id). */
  externalId: string | null;
  /** URL pública original del item (para dedup por source_url normalizada). */
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  type: 'video' | 'image' | 'carousel';
  /** Duración en segundos (solo video). */
  duration: number | null;
  width: number | null;
  height: number | null;
  publishedAt: string | null;
  metadata: Record<string, unknown>;
}

/** Contrato que deben implementar los providers de fuente. */
export interface SourceProvider {
  /** Nombre de la plataforma ('instagram' | 'youtube' | 'facebook'). */
  name: SourceProviderName;
  /** ¿Esta URL pertenece a la plataforma? (siempre sí para su registry entry). */
  canHandle(url: string): boolean;
  /**
   * Verifica si la fuente es accesible usando SOLO APIs oficiales.
   * Nunca lanza: ante fallos inesperados retorna 'ERROR'.
   */
  checkAccessibility(url: string): Promise<SourceAccessibility>;
  /** Obtiene metadatos públicos del contenido. Requiere ACCESSIBLE previo. */
  fetchMetadata(url: string): Promise<MediaItem[]>;
}

/** Resultado del chequeo (usado por /api/sources/check y el Dashboard). */
export interface SourceCheckResult {
  provider: SourceProviderName | 'unsupported';
  /** URL normalizada (sin UTM, sin hash, sin trailing slash). */
  url: string;
  contentType: SourceContentType;
  identifier: string;
  accessibility: SourceAccessibility;
  /** Mensaje humano listo para mostrar en la UI. */
  message: string;
  /** Cantidad de items importables (solo si ACCESSIBLE). */
  mediaCount: number;
}

/**
 * Mensaje de conteo con concordancia en español:
 * - YouTube/Facebook: "12 videos encontrados"
 * - Instagram: "12 publicaciones encontradas"
 */
export function mediaCountMessage(provider: SourceProviderName, count: number): string {
  if (count <= 0) return 'No se encontró contenido importable.';
  if (provider === 'instagram') {
    return count === 1 ? '1 publicación encontrada' : `${count} publicaciones encontradas`;
  }
  return count === 1 ? '1 video encontrado' : `${count} videos encontrados`;
}

/** Mensaje humano para AUTH_REQUIRED por plataforma. */
export function authRequiredMessage(provider: SourceProviderName): string {
  switch (provider) {
    case 'instagram':
      return 'Necesitas conectar tu cuenta de Instagram para acceder a este contenido.';
    case 'youtube':
      return 'Necesitas conectar tu cuenta de YouTube.';
    case 'facebook':
      return 'Necesitas conectar tu cuenta de Facebook para acceder a este contenido.';
  }
}
