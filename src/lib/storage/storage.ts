/**
 * FASE 8 — Cliente de Supabase Storage para los buckets 'raw' y 'processed'.
 *
 * - uploadFile(bucket, path, buffer, contentType): sube un Buffer al bucket
 *   (upsert) y retorna su URL pública.
 * - getPublicUrl(bucket, path): URL pública sin subir nada (síncrono).
 * - downloadFile(bucket, path): descarga un objeto del bucket como Buffer.
 * - getSignedUrl(bucket, path, expiresIn): URL firmada temporal.
 * - extractStoragePath(url): parsea URLs de Supabase Storage a { bucket, path }.
 *
 * Credenciales: usa SUPABASE_SERVICE_ROLE_KEY si existe (backend, bypassa RLS);
 * fallback a NEXT_PUBLIC_SUPABASE_ANON_KEY. No usa el generic `Database`
 * (cliente tipado `any`, según regla de la Fase 8).
 */
import { createClient } from '@supabase/supabase-js';

export const STORAGE_BUCKETS = ['raw', 'processed'] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

const BUCKET_CONFIG: Record<
  StorageBucket,
  { public: true; allowedMimeTypes: string[]; fileSizeLimit: number }
> = {
  raw: {
    public: true,
    allowedMimeTypes: ['video/*', 'image/*', 'audio/*'],
    fileSizeLimit: 1024 * 1024 * 1024, // 1GB (videos de hasta ~10 min)
  },
  processed: {
    public: true,
    allowedMimeTypes: ['video/*', 'image/*'],
    fileSizeLimit: 1024 * 1024 * 1024, // 1GB
  },
};

let cachedClient: any = null;

/** Cliente Storage: service-role si existe, fallback anon. Sin generic `Database`. */
function getStorageClient(): any {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }

  cachedClient = createClient<any>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

const ensuredBuckets = new Set<StorageBucket>();

/**
 * Crea el bucket si aún no existe (idempotente, patrón supabase/storage.ts).
 * Exportado también para el flujo de subida directa (signed-upload.ts).
 */
export async function ensureStorageBucket(bucket: StorageBucket): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;

  const client = getStorageClient();
  const { data: existing, error: listError } = await client.storage.listBuckets();
  if (listError) {
    throw new Error(`Storage listBuckets failed: ${listError.message}`);
  }

  if (!existing?.some((b: { name: string }) => b.name === bucket)) {
    const { error } = await client.storage.createBucket(bucket, BUCKET_CONFIG[bucket]);
    // Otro proceso pudo crearlo en paralelo → ignorar "already exists".
    if (error && !/exists/i.test(error.message)) {
      throw new Error(`Storage createBucket (${bucket}) failed: ${error.message}`);
    }
  }

  ensuredBuckets.add(bucket);
}

/** Sube un Buffer al bucket (upsert) y retorna su URL pública. */
export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await ensureStorageBucket(bucket);

  const client = getStorageClient();
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
  }

  return getPublicUrl(bucket, path);
}

/** URL pública de un objeto del bucket (síncrono, no requiere subida previa). */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const client = getStorageClient();
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl as string;
}

/** URL firmada temporal de un objeto del bucket. */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn = 60 * 60
): Promise<string> {
  const client = getStorageClient();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(`Storage sign failed (${bucket}/${path}): ${error?.message ?? 'sin datos'}`);
  }
  return data.signedUrl as string;
}

/** Descarga un objeto del bucket como Buffer. */
export async function downloadFile(bucket: StorageBucket, path: string): Promise<Buffer> {
  const client = getStorageClient();
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(
      `Storage download failed (${bucket}/${path}): ${error?.message ?? 'sin datos'}`
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

function isStorageBucket(value: string): value is StorageBucket {
  return (STORAGE_BUCKETS as readonly string[]).includes(value);
}

/**
 * Extrae { bucket, path } de una URL pública/firmada de Supabase Storage.
 * Retorna null si la URL es externa (CDN de la plataforma, etc.).
 */
export function extractStoragePath(
  url: string | null | undefined
): { bucket: StorageBucket; path: string } | null {
  if (!url) return null;

  const match = url.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/
  );
  if (!match) return null;

  const bucket = match[1];
  if (!isStorageBucket(bucket)) return null;

  try {
    return { bucket, path: decodeURIComponent(match[2]) };
  } catch {
    return { bucket, path: match[2] };
  }
}
