/**
 * FASE 8 — Pipeline real de FFmpeg con child_process (sin dependencias npm).
 *
 * - probeVideo(filePath): metadata completa vía ffprobe (duración, dimensiones,
 *   códec, aspect ratio, isVertical, is9x16, streams de video/audio).
 * - generateThumbnail(inputPath, outputPath): frame en el segundo 1.
 * - transcodeToVertical916(input, output): transcode completo a 1080x1920:
 *     scale + pad negro (mantiene aspecto) → libx264 preset fast crf 23 →
 *     maxrate 2500k → loudnorm -16 LUFS → faststart para web.
 *
 * FALLBACK (spec): si ffmpeg/ffprobe NO están instalados (caso local/dev),
 * transcodeToVertical916 copia el input al output y probeVideo retorna null
 * para NO romper el dev. En producción (ffmpeg instalado) corre el proceso
 * real. La disponibilidad se cachea tras el primer chequeo.
 */
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** 10 min por comando (videos largos). */
const EXEC_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;

/** Códec video requerido para skip: h264. */
export const SKIP_CODEC = 'h264';
/** Ancho máximo para skip (spec: <= 1080 sin reproceso). */
export const SKIP_MAX_WIDTH = 1080;
/** Target del transcode: TikTok 9:16. */
export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1920;

export interface VideoProbe {
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
  /** códec del stream de video (h264, hevc, vp9, ...) */
  codec: string | null;
  /** aspect ratio simplificado por GCD, p. ej. "9:16", "16:9" */
  aspectRatio: string | null;
  isVertical: boolean;
  /** true si w/h ≈ 9/16 (tolerancia 1.5%) */
  is9x16: boolean;
}

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
}

let ffmpegAvailable: boolean | null = null;
let ffprobeAvailable: boolean | null = null;

async function checkBinary(binary: string, flag: string): Promise<boolean> {
  try {
    await execAsync(`${binary} ${flag}`, { timeout: 15_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable === null) {
    ffmpegAvailable = await checkBinary('ffmpeg', '-version');
  }
  return ffmpegAvailable;
}

async function hasFfprobe(): Promise<boolean> {
  if (ffprobeAvailable === null) {
    ffprobeAvailable = await checkBinary('ffprobe', '-version');
  }
  return ffprobeAvailable;
}

/** Disponibilidad (cacheada) de los binarios — para metadata.processing. */
export async function getFfmpegAvailable(): Promise<boolean> {
  return hasFfmpeg();
}

export async function getFfprobeAvailable(): Promise<boolean> {
  return hasFfprobe();
}

/** Entrecomilla una ruta para la línea de comandos (soporta espacios en Windows). */
function quote(filePath: string): string {
  return `"${filePath.replace(/"/g, '\\"')}"`;
}

/** Aspect ratio simplificado por GCD: "1080x1920" -> "9:16". */
function aspectRatioString(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

/** true si w/h ≈ 9/16 (tolerancia 1.5% — cubre 1080x1921, etc.). */
function is9x16Ratio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - 9 / 16) <= 0.015;
}

function buildProbe(info: FfprobeOutput): VideoProbe {
  const videoStream = info.streams?.find((s) => s.codec_type === 'video');
  const hasAudioStream = info.streams?.some((s) => s.codec_type === 'audio') ?? false;
  const duration = info.format?.duration;
  const width = typeof videoStream?.width === 'number' ? videoStream.width : null;
  const height = typeof videoStream?.height === 'number' ? videoStream.height : null;

  return {
    hasVideoStream: Boolean(videoStream && width && height && width > 0 && height > 0),
    hasAudioStream,
    duration: duration ? Math.round(parseFloat(duration) * 1000) / 1000 : null,
    width,
    height,
    codec: videoStream?.codec_name ?? null,
    aspectRatio: width && height ? aspectRatioString(width, height) : null,
    isVertical: Boolean(width && height && height > width),
    is9x16: Boolean(width && height && is9x16Ratio(width, height)),
  };
}

/**
 * Corre ffprobe y extrae la metadata completa del video.
 *
 * - Sin ffprobe instalado (fallback dev) retorna null y no rompe el flujo.
 * - Con ffprobe instalado, si falla el comando lanza (paso METADATA fallido).
 */
export async function probeVideo(filePath: string): Promise<VideoProbe | null> {
  if (!(await hasFfprobe())) {
    return null;
  }

  const { stdout } = await execAsync(
    `ffprobe -v error -print_format json -show_format -show_streams ${quote(filePath)}`,
    { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: MAX_STDOUT_BYTES }
  );

  const info = JSON.parse(stdout) as FfprobeOutput;
  return buildProbe(info);
}

/**
 * Genera un thumbnail JPG del frame en el segundo 1 (`-ss 1` seek de input).
 * Requiere ffmpeg; si no está instalado lanza (el caller decide fallback).
 */
export async function generateThumbnail(
  inputPath: string,
  outputPath: string
): Promise<void> {
  if (!(await hasFfmpeg())) {
    throw new Error('ffmpeg no está instalado (thumbnail)');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await execAsync(
    `ffmpeg -y -ss 1 -i ${quote(inputPath)} -frames:v 1 -q:v 2 ${quote(outputPath)}`,
    { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: MAX_STDOUT_BYTES }
  );
}

/**
 * Transcode completo a TikTok 9:16 (1080x1920):
 *   -vf   scale(1080x1920, force_original_aspect_ratio=decrease) + pad negro
 *         centrado (mantiene aspecto) + setsar=1
 *   -c:v  libx264 -preset fast -crf 23
 *   -maxrate 2500k -bufsize 5000k
 *   -af   loudnorm I=-16 LUFS (solo si el input tiene stream de audio)
 *   -movflags +faststart (web)
 *
 * FALLBACK (spec): sin ffmpeg instalado copia input -> output (dev).
 * Con audio ausente se omiten los filtros/args de audio.
 */
export async function transcodeToVertical916(
  inputPath: string,
  outputPath: string,
  opts: { hasAudioStream?: boolean } = {}
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // FALLBACK: ffmpeg no está instalado → copia tal cual para no romper dev.
  if (!(await hasFfmpeg())) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  const audioArgs =
    opts.hasAudioStream !== false
      ? '-c:a aac -b:a 128k -af "loudnorm=I=-16:TP=-1.5:LRA=11"'
      : '-an';

  const cmd = [
    'ffmpeg -y',
    `-i ${quote(inputPath)}`,
    `-vf "scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"`,
    '-c:v libx264 -preset fast -crf 23',
    '-maxrate 2500k -bufsize 5000k',
    audioArgs,
    '-movflags +faststart',
    quote(outputPath),
  ].join(' ');

  await execAsync(cmd, {
    timeout: EXEC_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: MAX_STDOUT_BYTES,
  });
}
