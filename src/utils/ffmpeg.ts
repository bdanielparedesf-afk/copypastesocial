import { spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { config } from '@/config';

export interface TranscodeInput {
  inputPath: string;
  outputDir?: string;
}

export interface TranscodeRendition {
  resolution: string;
  width: number;
  height: number;
  outputPath: string;
}

export interface TranscodeResult {
  renditions: TranscodeRendition[];
  thumbnailPath: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
}

export interface ProbeResult {
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  bitrate: number | null;
}

const RENDITIONS = [
  { resolution: '1080p', width: 1920, height: 1080, maxrate: '5000k', bufsize: '10000k' },
  { resolution: '720p', width: 1280, height: 720, maxrate: '2500k', bufsize: '5000k' },
  { resolution: '480p', width: 854, height: 480, maxrate: '1000k', bufsize: '2000k' },
];

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(config.ffmpeg.path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    ffmpeg.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout || stderr);
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

export async function probeVideo(inputPath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const ffprobePath = config.ffmpeg.path.replace(/ffmpeg$/, 'ffprobe');
    const probe = spawn(
      ffprobePath,
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-select_streams', 'v:0',
        inputPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    probe.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    probe.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    probe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0];
        const format = data.format;
        resolve({
          duration: parseFloat(format?.duration) || null,
          width: stream?.width || null,
          height: stream?.height || null,
          codec: stream?.codec_name || null,
          bitrate: parseInt(format?.bit_rate, 10) || null,
        });
      } catch {
        resolve({ duration: null, width: null, height: null, codec: null, bitrate: null });
      }
    });

    probe.on('error', () => {
      resolve({ duration: null, width: null, height: null, codec: null, bitrate: null });
    });
  });
}

export async function transcodeVideo(input: TranscodeInput): Promise<TranscodeResult> {
  const outputDir = input.outputDir || join(tmpdir(), `transcode-${Date.now()}`);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const probeResult = await probeVideo(input.inputPath).catch(() => null);

  const renditionHeight = probeResult?.height || 1080;
  const applicableRenditions = RENDITIONS.filter((r) => r.height <= renditionHeight);

  if (applicableRenditions.length === 0) {
    applicableRenditions.push(RENDITIONS[RENDITIONS.length - 1]);
  }

  const renditions: TranscodeRendition[] = [];

  for (const rendition of applicableRenditions) {
    const outputPath = join(outputDir, `${rendition.resolution}.mp4`);
    await runFfmpeg([
      '-i', input.inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-profile:v', 'main',
      '-level', '4.0',
      '-vf', `scale=${rendition.width}:${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-maxrate', rendition.maxrate,
      '-bufsize', rendition.bufsize,
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    renditions.push({
      resolution: rendition.resolution,
      width: rendition.width,
      height: rendition.height,
      outputPath,
    });
  }

  const thumbnailPath = await generateThumbnail(input.inputPath, outputDir);

  return {
    renditions,
    thumbnailPath,
    duration: probeResult?.duration ?? null,
    width: probeResult?.width ?? null,
    height: probeResult?.height ?? null,
  };
}

export async function generateThumbnail(inputPath: string, outputDir: string): Promise<string | null> {
  const outputPath = join(outputDir, 'thumbnail.webp');

  try {
    await runFfmpeg([
      '-i', inputPath,
      '-ss', '00:00:01',
      '-vframes', '1',
      '-vf', 'scale=480:-1',
      '-c:v', 'libwebp',
      '-quality', '80',
      '-y',
      outputPath,
    ]);
    return outputPath;
  } catch {
    return null;
  }
}

export function getTempDir(): string {
  const dir = join(tmpdir(), `cps-${Date.now()}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanupTemp(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup errors
  }
}
