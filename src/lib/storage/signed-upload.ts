/**
 * FASE 21 — Subida directa navegador → Supabase Storage (URLs firmadas).
 *
 * PROBLEMA (413 FUNCTION_PAYLOAD_TOO_LARGE):
 *   Vercel limita el body de las Functions a 4.5MB. Enviar el video dentro
 *   del multipart de `/api/media/upload(-local)` devuelve 413 y la función
 *   ni siquiera se ejecuta (el límite lo aplica la plataforma).
 *
 * SOLUCIÓN (patrón oficial recomendado por Vercel):
 *   1. El cliente pide URLs firmadas con un JSON diminuto
 *      (POST /api/media/upload-url) → createSignedUploadTargets().
 *   2. El cliente sube el binario DIRECTO al bucket 'raw' con PUT a la
 *      signedUrl (no pasa por la función → sin límite de 4.5MB).
 *   3. El cliente confirma con un JSON de metadata
 *      (POST /api/media/finalize-upload) y ahí se crean las filas de BD.
 *
 * Convención de rutas (FASE 8): `{user_id}/{carpeta-unica}/{original.ext}`.
 * La carpeta única es imprescindible: el procesador FFmpeg deriva el
 * directorio del raw para `processed/processed.mp4` y `processed/thumbnail.jpg`;
 * compartir carpeta entre items haría que se sobreescribieran entre sí.
 */
import { randomUUID } from 'node:crypto';

import { createServerClient } from '@/lib/supabase';
import { ensureStorageBucket, type StorageBucket } from './storage';

/** Bucket donde aterrizan los originales (nunca se borran). */
export const UPLOAD_BUCKET: StorageBucket = 'raw';
/** Máximo de archivos por tanda (FASE 20). */
export const MAX_FILES_PER_BATCH = 50;
/** Máximo por archivo: 1GB (videos de hasta ~10 min). */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
/** Máximo por tanda: 5GB (hasta 5 videos de 1GB). */
export const MAX_BATCH_BYTES = 5 * 1024 * 1024 * 1024;

export interface UploadFileInput {
  name: string;
  size: number;
  type: string;
}

export interface UploadTarget {
  /** Ruta dentro del bucket (ej. `<user_id>/<uuid>/video.mp4`). */
  path: string;
  /** Token de subida firmada. */
  token: string;
  /** URL completa a la que el navegador hace PUT. */
  signedUrl: string;
  name: string;
  size: number;
  type: string;
}

export type UploadValidation =
  | { ok: true; files: UploadFileInput[] }
  | { ok: false; error: string; status: number };

/**
 * Archivos de video aceptados por extensión (fallback cuando el navegador
 * reporta `File.type === ''`, muy común en Windows con .mov/.mkv/.avi/.m2ts).
 * Se usa tanto en cliente como en servidor para no rechazar videos válidos.
 */
export const VIDEO_EXTENSIONS = [
  'mp4',
  'webm',
  'mov',
  'mkv',
  'avi',
  'm4v',
  '3gp',
  '3g2',
  'ogv',
  'mts',
  'm2ts',
  'flv',
  'wmv',
  'mpg',
  'mpeg',
] as const;

/** true si el nombre tiene una extensión de video conocida. */
export function hasVideoExtension(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

/** true si el archivo es video por MIME o por extensión (fallback Windows). */
export function isVideoFile(name: string, type: string): boolean {
  if (typeof type === 'string' && type.toLowerCase().startsWith('video/')) return true;
  return hasVideoExtension(name);
}

/** Limpia el nombre para usarlo como objeto de storage (sin rutas ni acentos). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'video';
  const ascii = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '');
  return (ascii || 'video').slice(-80);
}

/**
 * Valida la metadata de la tanda (cantidad, tamaño por archivo, total y tipo
 * de contenido). Compartida por /upload-url y /finalize-upload.
 */
export function validateUploadFiles(files: UploadFileInput[]): UploadValidation {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: 'No se proporcionaron archivos', status: 400 };
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return {
      ok: false,
      error: `Max ${MAX_FILES_PER_BATCH} por tanda (sube 1000 en tandas)`,
      status: 400,
    };
  }

  const videos = files.filter((f) => isVideoFile(f.name, f.type ?? ''));
  if (videos.length === 0) {
    return {
      ok: false,
      error: 'Archivos inválidos: solo se aceptan videos (MP4, WEBM, MOV, MKV, AVI)',
      status: 400,
    };
  }

  const oversized = videos.find((f) => f.size > MAX_FILE_BYTES);
  if (oversized) {
    return {
      ok: false,
      error: `Archivo demasiado grande: ${oversized.name} (máx 1GB)`,
      status: 400,
    };
  }

  const total = videos.reduce((acc, f) => acc + f.size, 0);
  if (total > MAX_BATCH_BYTES) {
    return { ok: false, error: 'Max 5GB por tanda', status: 400 };
  }

  return { ok: true, files: videos };
}

/** Cliente service-role (crear signed upload URLs requiere bypassar RLS). */
function storageClient() {
  return createServerClient();
}

/**
 * Genera una signed upload URL por archivo (bucket 'raw').
 * El bucket se crea si no existe (idempotente).
 */
export async function createSignedUploadTargets(
  userId: string,
  files: UploadFileInput[]
): Promise<UploadTarget[]> {
  await ensureStorageBucket(UPLOAD_BUCKET);

  const client = storageClient();
  const targets: UploadTarget[] = [];

  for (const file of files) {
    const path = `${userId}/${randomUUID()}/${sanitizeFileName(file.name)}`;
    const { data, error } = await client.storage
      .from(UPLOAD_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data) {
      throw new Error(
        `No se pudo firmar la subida de ${file.name}: ${error?.message ?? 'sin datos'}`
      );
    }

    targets.push({
      path: data.path ?? path,
      token: data.token,
      signedUrl: data.signedUrl,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  }

  return targets;
}

/** true si la ruta pertenece al usuario (evita que se confirmen rutas ajenas). */
export function isOwnedStoragePath(userId: string, path: string): boolean {
  return (
    typeof path === 'string' &&
    path.length > userId.length + 1 &&
    path.startsWith(`${userId}/`) &&
    !path.includes('..')
  );
}

/** true si el objeto existe realmente en el bucket 'raw'. */
export async function rawObjectExists(path: string): Promise<boolean> {
  const dir = path.split('/').slice(0, -1).join('/');
  const fileName = path.split('/').pop() ?? '';

  const client = storageClient();
  const { data, error } = await client.storage
    .from(UPLOAD_BUCKET)
    .list(dir, { limit: 100, search: fileName });

  if (error) return false;
  return Boolean(data?.some((entry: { name: string }) => entry.name === fileName));
}

/** URL pública del objeto en el bucket 'raw'. */
export function rawPublicUrl(path: string): string {
  const client = storageClient();
  const { data } = client.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
  return data.publicUrl as string;
}

/* ------------------------------------------------------------------ *
 * Verificación de esquema (fail-fast antes de subir bytes)
 * ------------------------------------------------------------------ */

/** Migraciones que aportan el esquema del flujo de subida local. */
export const REQUIRED_MIGRATIONS = [
  '20240104000000_phase8_media_processing.sql',
  '20240109000000_phase18_local_upload_and_youtube_quota.sql',
  '20240110000000_phase21_direct_upload.sql',
] as const;

/** Columnas imprescindibles para persistir un upload local (FASE 24: incluye sources). */
export const REQUIRED_COLUMNS = [
  { table: 'sources', column: 'raw_path' },
  { table: 'sources', column: 'storage_released' },
  { table: 'media_items', column: 'raw_path' },
  { table: 'media_items', column: 'source_provider' },
  { table: 'publication_jobs', column: 'media_id' },
] as const;

export interface UploadSchemaStatus {
  ready: boolean;
  missing: string[];
  message: string | null;
}

/** Mensaje accionable cuando la DB no tiene el esquema aplicado. */
export function buildSchemaMessage(missing: string[]): string {
  return (
    `La base de datos no tiene aplicado el esquema de subida local ` +
    `(faltan: ${missing.join(', ')}). ` +
    `Aplica estas migraciones en Supabase → SQL Editor, en orden: ` +
    `${REQUIRED_MIGRATIONS.join(' → ')}.`
  );
}

/** Pista accionable a partir de un error de Postgres/PostgREST. */
export function buildDbErrorHint(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case '23514':
      return (
        'sources.provider no acepta el valor "local". ' +
        `Aplica ${REQUIRED_MIGRATIONS[2]} (o la migración de FASE 18) en Supabase.`
      );
    case '23502':
      return (
        'Falta una columna obligatoria para uploads locales (p. ej. ' +
        `publications.social_account_id). Aplica ${REQUIRED_MIGRATIONS[2]} en Supabase.`
      );
    case '42703':
    case 'PGRST204':
      return (
        'Faltan columnas del flujo de subida local en la base de datos. ' +
        `Aplica: ${REQUIRED_MIGRATIONS.join(' → ')}.`
      );
    default:
      return message ?? 'Error de base de datos';
  }
}

let cachedSchemaStatus: UploadSchemaStatus | null = null;

/**
 * Comprueba (cacheado por instancia) que la DB tenga las columnas que el
 * flujo de subida local necesita. Evita que el usuario suba 100MB y falle al
 * final por un esquema incompleto.
 */
export async function getUploadSchemaStatus(): Promise<UploadSchemaStatus> {
  if (cachedSchemaStatus) return cachedSchemaStatus;

  const client = storageClient();
  const missing: string[] = [];

  for (const check of REQUIRED_COLUMNS) {
    const { error } = await client.from(check.table).select(check.column).limit(0);
    if (error) missing.push(`${check.table}.${check.column}`);
  }

  cachedSchemaStatus = {
    ready: missing.length === 0,
    missing,
    message: missing.length === 0 ? null : buildSchemaMessage(missing),
  };

  return cachedSchemaStatus;
}

/** Solo para tests: limpia la cache de verificación de esquema. */
export function resetUploadSchemaCache(): void {
  cachedSchemaStatus = null;
}
