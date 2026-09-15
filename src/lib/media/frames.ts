/**
 * FASE IA — Extracción de fotogramas en el NAVEGADOR (sin ffmpeg).
 *
 * Motivación: el generador de título/descripción/hashtags solo recibía el
 * nombre del archivo → títulos incoherentes con el contenido real del video.
 * Con estos fotogramas (data URLs JPEG) la IA ve lo que pasa en el video.
 *
 * - Captura `count` frames repartidos por la duración (principio, medio, final).
 * - Redimensiona a máx 512px de ancho y JPEG q0.72 → ~50-150 KB por frame
 *   (payload pequeño para /api/ai/generate, sin riesgo de 413 en Vercel).
 * - Best-effort: si algo falla retorna [] y el flujo cae al contexto del
 *   nombre del archivo (nunca bloquea la subida ni la publicación).
 */

/** Número de fotogramas por video (principio/medio/final). */
export const FRAME_CAPTURE_COUNT = 3;
/** Ancho máximo del frame capturado (ahorro de payload). */
const FRAME_MAX_WIDTH = 512;
/** Timeout por 'seeked' (videos con seek lento). */
const SEEK_TIMEOUT_MS = 4000;
/** Timeout de carga de metadata. */
const METADATA_TIMEOUT_MS = 8000;

/** Resuelve en 'seeked' o por timeout (nunca rechaza). */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    const onSeeked = () => finish();
    video.addEventListener('seeked', onSeeked);
    setTimeout(finish, SEEK_TIMEOUT_MS);
    try {
      video.currentTime = time;
    } catch {
      finish();
    }
  });
}

/** Dibuja el frame actual en un canvas y lo devuelve como data URL JPEG. */
function captureFrame(video: HTMLVideoElement): string | null {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, FRAME_MAX_WIDTH / w);
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

/**
 * Extrae fotogramas de un archivo de video local.
 * Retorna data URLs `data:image/jpeg;base64,...` (máx `count`) o [] si
 * el navegador no puede decodificar el video o algo falla.
 */
export async function extractVideoFrames(
  file: File,
  count: number = FRAME_CAPTURE_COUNT
): Promise<string[]> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  if (!file.type.startsWith('video/')) return [];

  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  const frames: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('metadata timeout')), METADATA_TIMEOUT_MS);
      video.addEventListener(
        'loadedmetadata',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      video.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('video decode error'));
        },
        { once: true }
      );
    });

    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    // Reparte los frames: 1/6, 3/6, 5/6 de la duración (evita el primer frame negro).
    const positions =
      duration > 0
        ? Array.from({ length: count }, (_, i) => duration * ((i + 0.5) / count))
        : [0.1, 0.5, 1].slice(0, count);

    for (const pos of positions) {
      await seekTo(video, pos);
      const dataUrl = captureFrame(video);
      if (dataUrl) frames.push(dataUrl);
    }
  } catch {
    // Best-effort: sin frames la IA usa el nombre del archivo como contexto.
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
  return frames;
}
