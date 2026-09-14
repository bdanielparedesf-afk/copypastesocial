/**
 * FASE 21 — Cliente de subida directa a Supabase Storage.
 *
 * Por qué existe: mandar el video dentro del multipart de la API route hace
 * que Vercel rechace la petición con 413 FUNCTION_PAYLOAD_TOO_LARGE (límite
 * de 4.5MB del body de las Functions). Con URLs firmadas el binario va
 * DIRECTO del navegador a Storage y las funciones solo ven JSON diminuto.
 *
 * Flujo de uploadFilesDirect(files):
 *   1. POST /api/media/upload-url  → { targets: [{ path, token, signedUrl }] }
 *   2. PUT  signedUrl  (binario, con progreso vía XHR)
 *   3. POST /api/media/finalize-upload → crea media_items (+ jobs)
 *
 * Este módulo es isomorfo (solo fetch/XHR) para poder usarse desde
 * componentes 'use client'.
 */

export interface UploadTarget {
  path: string;
  token: string;
  signedUrl: string;
  name: string;
  size: number;
  type: string;
}

export interface FinalizedMediaItem {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  type: string;
  sourceProvider: string;
  metadata: Record<string, unknown> | null;
}

export interface DirectUploadResult {
  mediaItems: FinalizedMediaItem[];
  imported: number;
  jobsCreated: number;
  publicationId: string | null;
  sourceId: string | null;
}

export interface DirectUploadOptions {
  /** Progreso global 0..100 (ponderado por tamaño de archivo). */
  onProgress?: (percent: number) => void;
  /** Crear publication_jobs por destino (IG/YT/FB/TT). Default true. */
  createJobs?: boolean;
}

/** Lee el mensaje de error de una respuesta JSON (o texto plano). */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // respuesta sin JSON
  }
  if (res.status === 413) {
    return 'El servidor rechazó el archivo (413 Payload Too Large). Reintenta la subida.';
  }
  return `${fallback} (HTTP ${res.status})`;
}

/** 1) Pide las URLs firmadas de subida (solo metadata). */
export async function requestUploadTargets(files: File[]): Promise<UploadTarget[]> {
  const res = await fetch('/api/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    }),
  });

  if (!res.ok) throw new Error(await readError(res, 'No se pudieron preparar las subidas'));

  const body = (await res.json()) as { success?: boolean; targets?: UploadTarget[] };
  if (!body.success || !body.targets?.length) {
    throw new Error('El servidor no devolvió URLs de subida');
  }
  return body.targets;
}

/**
 * 2) Sube el archivo a su signedUrl con PUT (XHR para tener progreso real).
 * El token de la URL firmada es la autorización: no se envían credenciales.
 */
export function uploadFileToSignedUrl(
  file: File,
  target: UploadTarget,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size, file.size);
        resolve();
        return;
      }
      if (xhr.status === 413) {
        reject(new Error(`Storage rechazó ${file.name}: archivo demasiado grande (413)`));
        return;
      }
      reject(
        new Error(
          `No se pudo subir ${file.name} a Storage (HTTP ${xhr.status}): ${xhr.responseText.slice(0, 200)}`
        )
      );
    };
    xhr.onerror = () => reject(new Error(`Error de conexión subiendo ${file.name}`));
    xhr.onabort = () => reject(new Error(`Subida cancelada: ${file.name}`));

    // El binario va directo al Storage (nunca por las API routes).
    xhr.send(file);
  });
}

/** 3) Confirma la subida: crea source/publication/media_items (+ jobs). */
export async function finalizeDirectUpload(
  targets: UploadTarget[],
  opts: { createJobs?: boolean } = {}
): Promise<DirectUploadResult> {
  const res = await fetch('/api/media/finalize-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: targets.map((t) => ({ path: t.path, name: t.name, size: t.size, type: t.type })),
      createJobs: opts.createJobs ?? true,
    }),
  });

  if (!res.ok) throw new Error(await readError(res, 'No se pudieron registrar los videos'));

  const body = (await res.json()) as Partial<DirectUploadResult> & { success?: boolean };
  if (!body.success) throw new Error('El servidor no confirmó la subida');

  return {
    mediaItems: body.mediaItems ?? [],
    imported: body.imported ?? body.mediaItems?.length ?? 0,
    jobsCreated: body.jobsCreated ?? 0,
    publicationId: body.publicationId ?? null,
    sourceId: body.sourceId ?? null,
  };
}

/**
 * Subida completa (URLs firmadas → PUT directo → confirmación).
 * Los archivos se suben en secuencia para que el progreso sea legible y no
 * saturar la conexión del usuario.
 */
export async function uploadFilesDirect(
  files: File[],
  options: DirectUploadOptions = {}
): Promise<DirectUploadResult> {
  const { onProgress, createJobs = true } = options;
  if (files.length === 0) {
    return { mediaItems: [], imported: 0, jobsCreated: 0, publicationId: null, sourceId: null };
  }

  const targets = await requestUploadTargets(files);

  const totalBytes = targets.reduce((acc, t) => acc + (t.size || 0), 0) || 1;
  let completedBytes = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const file = files[i];
    if (!file) continue;

    await uploadFileToSignedUrl(file, target, (loaded) => {
      const percent = Math.min(99, Math.round(((completedBytes + loaded) / totalBytes) * 100));
      onProgress?.(percent);
    });
    completedBytes += target.size || 0;
    onProgress?.(Math.min(99, Math.round((completedBytes / totalBytes) * 100)));
  }

  const result = await finalizeDirectUpload(targets, { createJobs });
  onProgress?.(100);
  return result;
}