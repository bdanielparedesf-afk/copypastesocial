/**
 * FASE 21 — Tests de los helpers de subida directa navegador → Storage.
 *
 * Contexto: subir el video dentro del body de una API route provocaba
 * 413 FUNCTION_PAYLOAD_TOO_LARGE en Vercel (límite de 4.5MB del body). El
 * flujo ahora firma URLs de subida, por lo que las validaciones de tanda y el
 * ownership de las rutas son la primera línea de defensa.
 */
import { describe, it, expect } from 'vitest';

// El módulo importa el cliente Supabase, que exige env en import-time.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const {
  validateUploadFiles,
  sanitizeFileName,
  isOwnedStoragePath,
  isVideoFile,
  hasVideoExtension,
  buildSchemaMessage,
  buildDbErrorHint,
  MAX_FILES_PER_BATCH,
  MAX_FILE_BYTES,
  MAX_BATCH_BYTES,
} = await import('./signed-upload');

const video = (name: string, size = 1024, type = 'video/mp4') => ({ name, size, type });

describe('validateUploadFiles', () => {
  it('rechaza una tanda vacía', () => {
    const result = validateUploadFiles([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rechaza más de 50 archivos por tanda', () => {
    const files = Array.from({ length: MAX_FILES_PER_BATCH + 1 }, (_, i) => video(`v${i}.mp4`));
    const result = validateUploadFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_FILES_PER_BATCH));
  });

  it('descarta los archivos que no son video', () => {
    const result = validateUploadFiles([
      video('a.mp4'),
      { name: 'foto.png', size: 2048, type: 'image/png' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('a.mp4');
    }
  });

  it('falla si no queda ningún video válido', () => {
    const result = validateUploadFiles([{ name: 'doc.pdf', size: 10, type: 'application/pdf' }]);
    expect(result.ok).toBe(false);
  });

  it('rechaza archivos de más de 1GB', () => {
    const result = validateUploadFiles([video('grande.mp4', MAX_FILE_BYTES + 1)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('grande.mp4');
  });

  it('rechaza tandas que superan los 5GB en total', () => {
    // 6 archivos de 900MB: cada uno es válido (< 1GB) pero la suma supera 5GB.
    const each = 900 * 1024 * 1024;
    const files = Array.from({ length: 6 }, (_, i) => video(`big${i}.mp4`, each));
    expect(each * files.length).toBeGreaterThan(MAX_BATCH_BYTES);
    const result = validateUploadFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5GB');
  });

  it('acepta una tanda válida y conserva tamaño y tipo', () => {
    const result = validateUploadFiles([video('reel.mp4', 12 * 1024 * 1024)]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0].size).toBe(12 * 1024 * 1024);
      expect(result.files[0].type).toBe('video/mp4');
    }
  });

  it('acepta videos con type vacío si la extensión es de video (Windows)', () => {
    const result = validateUploadFiles([{ name: 'clip.mov', size: 1024, type: '' }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.files[0].name).toBe('clip.mov');
  });
});

describe('isVideoFile / hasVideoExtension', () => {
  it('acepta por MIME video aunque la extensión sea rara', () => {
    expect(isVideoFile('sin-extension', 'video/mp4')).toBe(true);
  });

  it('acepta por extensión cuando el type viene vacío (Windows)', () => {
    expect(hasVideoExtension('clip.MOV')).toBe(true);
    expect(isVideoFile('clip.mov', '')).toBe(true);
    expect(isVideoFile('pelicula.mkv', '')).toBe(true);
  });

  it('rechaza extensiones que no son video', () => {
    expect(isVideoFile('doc.pdf', '')).toBe(false);
    expect(isVideoFile('foto.png', 'image/png')).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('quita la ruta y normaliza espacios', () => {
    const result = sanitizeFileName('mi video final.mp4');
    expect(result).toBe('mi_video_final.mp4');
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
  });

  it('quita acentos y caracteres no seguros', () => {
    const result = sanitizeFileName('vídeo ñ#1.mp4');
    expect(result).toBe('video_n_1.mp4');
  });

  it('nunca devuelve un nombre vacío', () => {
    expect(sanitizeFileName('...')).toBe('video');
  });
});

describe('isOwnedStoragePath', () => {
  const USER = '00000000-0000-0000-0000-000000000001';

  it('acepta rutas del propio usuario', () => {
    expect(isOwnedStoragePath(USER, `${USER}/f47ac0fb/reel.mp4`)).toBe(true);
  });

  it('rechaza rutas de otro usuario', () => {
    expect(isOwnedStoragePath(USER, 'otro-user/f47ac0fb/reel.mp4')).toBe(false);
  });

  it('rechaza el propio prefijo sin carpeta de archivo', () => {
    expect(isOwnedStoragePath(USER, USER)).toBe(false);
  });

  it('rechaza intentos de path traversal', () => {
    expect(isOwnedStoragePath(USER, `${USER}/../otro/reel.mp4`)).toBe(false);
  });
});

describe('buildSchemaMessage / buildDbErrorHint', () => {
  it('el mensaje de esquema nombra las columnas y las migraciones', () => {
    const message = buildSchemaMessage(['media_items.raw_path']);
    expect(message).toContain('media_items.raw_path');
    expect(message).toContain('20240110000000_phase21_direct_upload.sql');
  });

  it('traduce el CHECK de provider (23514) a una acción concreta', () => {
    const hint = buildDbErrorHint('23514', 'new row violates check constraint');
    expect(hint).toContain('sources.provider');
    expect(hint).toContain('phase21_direct_upload.sql');
  });

  it('traduce la falta de columna obligatoria (23502)', () => {
    expect(buildDbErrorHint('23502', 'null value')).toContain('obligatoria');
  });

  it('traduce columnas inexistentes (42703 / PGRST204)', () => {
    expect(buildDbErrorHint('42703', 'column does not exist')).toContain('Faltan columnas');
    expect(buildDbErrorHint('PGRST204', 'column not found')).toContain('Faltan columnas');
  });

  it('conserva el mensaje original para errores desconocidos', () => {
    expect(buildDbErrorHint(undefined, 'boom')).toBe('boom');
  });
});
