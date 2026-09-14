'use client';

/**
 * Modal de subida de videos desde la PC.
 * POST /api/media/upload-local con progreso real (XHR).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Film,
  HardDriveUpload,
  Loader2,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { uploadFilesDirect } from '@/lib/upload/direct-upload';
import { cn } from '@/utils';

const MAX_FILES = 50;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded?: (imported: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; jobs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setProgress(0);
      setResult(null);
      setError(null);
      setIsDragOver(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, uploading, onClose]);
  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null);
    const list = Array.from(incoming);
    const videos = list.filter((f) => f.type.startsWith('video/'));
    const rejected = list.length - videos.length;
    setFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) {
        setError(`Maximo ${MAX_FILES} archivos por tanda.`);
        return prev;
      }
      let next = [...prev, ...videos.slice(0, room)];
      const total = next.reduce((acc, f) => acc + f.size, 0);
      if (total > MAX_TOTAL_SIZE) {
        setError('La tanda supera los 500MB. Quita algunos archivos.');
        next = prev;
      }
      if (videos.some((f) => f.size > MAX_FILE_SIZE)) {
        setError('Hay archivos de mas de 100MB (maximo por archivo).');
      }
      if (rejected > 0) {
        toast.warning(`${rejected} archivo(s) ignorados: solo se aceptan videos`);
      }
      return next;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(() => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    // FASE 21 — Subida directa navegador → Supabase Storage (URLs firmadas).
    // El binario NO pasa por la API route: así Vercel no responde 413
    // (FUNCTION_PAYLOAD_TOO_LARGE, body máximo de 4.5MB).
    uploadFilesDirect(files, { onProgress: (p) => setProgress(p), createJobs: true })
      .then((res) => {
        const imported = res.imported || files.length;
        setUploading(false);
        setProgress(100);
        setResult({ imported, jobs: res.jobsCreated });
        toast.success(`${imported} video(s) listos para publicar en tus redes`);
        onUploaded?.(imported);
      })
      .catch((e: unknown) => {
        setUploading(false);
        setProgress(0);
        setError(e instanceof Error ? e.message : 'No se pudieron subir los archivos');
      });
  }, [files, uploading, onUploaded]);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => !uploading && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong neon-border relative w-full max-w-xl overflow-hidden rounded-2xl p-6"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-60"
              style={{
                background:
                  'radial-gradient(circle at 50% 0%, rgba(124,58,237,0.35), transparent 70%)',
              }}
            />

            <div className="relative mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan shadow-glow-purple">
                  <HardDriveUpload size={22} className="text-white" />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">
                    Subir videos desde tu PC
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Se encolan para Instagram - YouTube - Facebook - TikTok
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !uploading && onClose()}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand-purple/60 hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            {result ? (
              <div className="relative flex flex-col items-center gap-4 py-10 text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 14 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 shadow-glow-cyan"
                >
                  <CheckCircle2 size={36} />
                </motion.div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {result.imported} video{result.imported !== 1 ? 's' : ''} en cola
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.jobs} publicaciones programadas (4 por video: IG - YT - FB - TT).
                    Procesa la cola desde Publicaciones.
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  <Link href="/content" onClick={onClose}>
                    <Button variant="glow" size="lg">
                      <Film size={16} />
                      Ver mi contenido
                    </Button>
                  </Link>
                  <Button variant="outline" size="lg" onClick={onClose}>
                    Cerrar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Zona para soltar o elegir videos"
                  onClick={() => !uploading && inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !uploading) inputRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploading) setIsDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (!uploading) addFiles(e.dataTransfer.files);
                  }}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300',
                    isDragOver
                      ? 'border-brand-cyan bg-brand-cyan/10 shadow-glow-cyan'
                      : 'border-border hover:border-brand-purple/60 hover:bg-brand-purple/5',
                    uploading && 'pointer-events-none opacity-60'
                  )}
                >
                  <motion.span
                    animate={isDragOver ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-purple/20 to-brand-cyan/20 text-brand-purple"
                  >
                    <HardDriveUpload size={26} />
                  </motion.span>
                  <p className="text-sm font-medium text-foreground">
                    {isDragOver ? 'Suéltalos aquí!' : 'Arrastra tus videos aquí o haz clic para elegir'}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    MP4 - WEBM - MOV — máx 100MB por video - {MAX_FILES} por tanda
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>

                {files.length > 0 && (
                  <div className="relative mt-4 max-h-40 space-y-2 overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                      {files.map((file, index) => (
                        <motion.div
                          key={`${file.name}-${index}`}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 12 }}
                          className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                        >
                          <Film size={15} className="shrink-0 text-brand-purple" />
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {file.name}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {formatSize(file.size)}
                          </span>
                          {!uploading && (
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              aria-label={`Quitar ${file.name}`}
                              className="text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {error && (
                  <div className="relative mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="relative mt-5 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {files.length > 0
                      ? `${files.length} video(s) - ${formatSize(totalSize)}`
                      : 'Sin archivos seleccionados'}
                  </span>
                  <Button
                    variant="glow"
                    onClick={handleUpload}
                    disabled={files.length === 0 || uploading}
                    size="lg"
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Subiendo... {progress}%
                      </>
                    ) : (
                      <>
                        <HardDriveUpload size={16} />
                        Subir y encolar
                      </>
                    )}
                  </Button>
                </div>

                {uploading && (
                  <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-cyan shadow-glow-purple"
                      animate={{ width: `${progress}%` }}
                      transition={{ ease: 'easeOut', duration: 0.3 }}
                    />
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

