'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlignLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Film,
  Hash,
  Link2,
  LoaderCircle,
  Send,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  Users,
  Wand2,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@/components/ui';
import { uploadFilesDirect } from '@/lib/upload/direct-upload';
import { cn } from '@/utils';

type Platform = 'instagram' | 'youtube' | 'facebook' | 'tiktok';

interface ComposerFile {
  localId: string;
  mediaId: string | null;
  fileName: string;
  size: number;
  previewUrl: string;
  uploadStatus: 'uploading' | 'ready' | 'error';
  processStatus: 'pending' | 'processing' | 'done' | 'failed' | null;
  uploadError?: string;
  title: string;
  description: string;
  hashtagsText: string;
  aiStatus: 'idle' | 'loading' | 'done' | 'error';
}

interface SocialAccount {
  id: string;
  provider: string;
  username: string;
  is_valid: boolean;
  used_today?: number;
  expiring_in_days: number | null;
}

interface PublishRow {
  key: string;
  fileName: string;
  account: string;
  status: 'publishing' | 'published' | 'scheduled' | 'failed';
  message: string;
}

const PLATFORMS: Array<{ id: Platform; label: string }> = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
];

const MAX_CAPTION = 2200;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function prettyName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_\-\d]+/g, ' ').trim() || name;
}

function buildCaption(f: ComposerFile): string {
  const tags = f.hashtagsText
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .join(' ');
  const caption = [f.title.trim(), f.description.trim(), tags].filter(Boolean).join('\n\n');
  return caption.length > MAX_CAPTION ? `${caption.slice(0, MAX_CAPTION - 3)}...` : caption;
}

export default function ComposePage() {
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PublishRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Modo automático: subir → procesar → IA → publicar en lote
  const [autoMode, setAutoMode] = useState(true);
  const [stagger, setStagger] = useState(true);
  const [pipeline, setPipeline] = useState<{
    stage: 'idle' | 'uploading' | 'ai' | 'publishing' | 'done' | 'error';
    message: string;
  }>({ stage: 'idle', message: '' });
  const [batchSummary, setBatchSummary] = useState<{
    created: number;
    skipped: number;
    horizonDays: number;
    immediate: boolean;
  } | null>(null);
  const filesRef = useRef<ComposerFile[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/accounts');
        const body = (await res.json()) as { accounts?: SocialAccount[]; error?: string };
        const list = (body.accounts ?? []).filter((a) => a.is_valid);
        setAccounts(list);
        setSelected(new Set(list.map((a) => a.id)));
      } catch {
        toast.error('No se pudieron cargar las cuentas');
      } finally {
        setAccountsLoading(false);
      }
    })();
  }, []);

  const updateFile = (localId: string, patch: Partial<ComposerFile>) =>
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));

  const addFiles = (list: FileList | File[] | null) => {
    const vids = Array.from(list ?? []).filter((f) => f.type.startsWith('video/'));
    if (vids.length === 0) {
      toast.error('Arrastra archivos de video (mp4, mov, webm...)');
      return;
    }
    const items: ComposerFile[] = vids.map((f, i) => ({
      localId: `${Date.now()}-${i}-${f.name}`,
      mediaId: null,
      fileName: f.name,
      size: f.size,
      previewUrl: URL.createObjectURL(f),
      uploadStatus: 'uploading',
      processStatus: null,
      title: '',
      description: '',
      hashtagsText: '',
      aiStatus: 'idle',
    }));
    setFiles((prev) => [...prev, ...items]);
    if (autoMode) {
      void runAutoPipeline(vids, items);
    } else {
      void uploadAll(vids, items);
    }
  };

  const uploadAll = async (
    vids: File[],
    items: ComposerFile[]
  ): Promise<Array<{ localId: string; mediaId: string | null }>> => {
    const uploaded: Array<{ localId: string; mediaId: string | null }> = [];
    setUploading(true);
    try {
      // FASE 21 — Subida directa navegador → Supabase Storage (URLs firmadas).
      // El binario no pasa por la API route: evita el 413 de Vercel
      // (FUNCTION_PAYLOAD_TOO_LARGE, body máximo de 4.5MB por Function).
      const body = await uploadFilesDirect(vids, { createJobs: true });
      items.forEach((it, i) => {
        const mediaId = body.mediaItems[i]?.id ?? null;
        uploaded.push({ localId: it.localId, mediaId });
        updateFile(
          it.localId,
          mediaId
            ? { mediaId, uploadStatus: 'ready' }
            : { uploadStatus: 'error', uploadError: 'Sin respuesta del servidor' }
        );
      });
      toast.success(`${vids.length} video(s) subido(s)`);
      // Proceso FFmpeg → status READY (secuencial)
      for (let i = 0; i < body.mediaItems.length; i++) {
        const mediaId = body.mediaItems[i]?.id;
        const localId = items[i]?.localId;
        if (!mediaId || !localId) continue;
        updateFile(localId, { processStatus: 'processing' });
        try {
          const pr = await fetch('/api/media/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaItemId: mediaId }),
          });
          const pb = (await pr.json()) as { error?: string };
          if (!pr.ok) throw new Error(pb.error ?? 'Proceso falló');
          updateFile(localId, { processStatus: 'done' });
        } catch (e) {
          updateFile(localId, {
            processStatus: 'failed',
            uploadError: e instanceof Error ? e.message : 'Proceso falló',
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al subir';
      items.forEach((it) => updateFile(it.localId, { uploadStatus: 'error', uploadError: msg }));
      toast.error(msg);
    } finally {
      setUploading(false);
    }
    return uploaded;
  };

  const removeFile = (localId: string) =>
    setFiles((prev) => {
      const target = prev.find((f) => f.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.localId !== localId);
    });

  const generateAI = async (f: ComposerFile) => {
    if (!f.mediaId) {
      toast.error('Espera a que termine la subida');
      return;
    }
    updateFile(f.localId, { aiStatus: 'loading' });
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaItemIds: [f.mediaId],
          action: 'pack',
          platform,
          context: prettyName(f.fileName),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        results?: Array<{ pack?: { title: string; description: string; hashtags: string[] } }>;
      };
      const pack = body.results?.[0]?.pack;
      if (!res.ok || !pack) throw new Error(body.error ?? 'IA no disponible');
      updateFile(f.localId, {
        title: pack.title,
        description: pack.description,
        hashtagsText: pack.hashtags.join(' '),
        aiStatus: 'done',
      });
    } catch (e) {
      updateFile(f.localId, { aiStatus: 'error' });
      toast.error(e instanceof Error ? e.message : 'Error al generar con IA');
    }
  };

  const generateAllAI = async () => {
    const pending = files.filter((f) => f.mediaId && f.aiStatus !== 'done');
    if (pending.length === 0) {
      toast.info('No hay videos pendientes de IA');
      return;
    }
    for (const f of pending) {
      await generateAI(f);
    }
    toast.success('Pack de IA aplicado ✨');
  };

  const runAutoPipeline = async (vids: File[], items: ComposerFile[]) => {
    try {
      setBatchSummary(null);
      setPipeline({ stage: 'uploading', message: `Subiendo y procesando ${vids.length} video(s)...` });
      const uploaded = await uploadAll(vids, items);
      const ready = uploaded.filter((u): u is { localId: string; mediaId: string } => !!u.mediaId);
      if (ready.length === 0) {
        setPipeline({ stage: 'error', message: 'Ningún video quedó listo (revisa los errores de subida/proceso)' });
        return;
      }

      // IA en secuencia (1 llamada por video: título + descripción + hashtags)
      for (let i = 0; i < ready.length; i++) {
        const u = ready[i];
        const f = filesRef.current.find((x) => x.localId === u.localId);
        if (f) await generateAI(f);
        setPipeline({ stage: 'ai', message: `Generando IA ${i + 1}/${ready.length}...` });
      }

      if (selected.size === 0) {
        setPipeline({ stage: 'error', message: 'Selecciona al menos una cuenta para publicar' });
        return;
      }

      const ops = ready.length * selected.size;
      setPipeline({ stage: 'publishing', message: `Encolando ${ops} publicación(es)...` });
      const res = await fetch('/api/publish/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: ready.map((u) => {
            const f = filesRef.current.find((x) => x.localId === u.localId);
            return { media_id: u.mediaId, caption: f ? buildCaption(f) : '' };
          }),
          social_account_ids: Array.from(selected),
          mode: stagger ? 'stagger' : 'immediate',
          stagger_minutes: 60,
        }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        created?: Array<{ scheduled_at: string | null }>;
        skipped?: Array<{ reason: string }>;
        schedule_horizon_days?: number;
      };
      if (!res.ok || !body.success) throw new Error(body.error ?? 'Error al encolar el lote');

      const createdCount = body.created?.length ?? 0;
      const skippedCount = body.skipped?.length ?? 0;
      const immediate = !stagger;
      setBatchSummary({
        created: createdCount,
        skipped: skippedCount,
        horizonDays: body.schedule_horizon_days ?? 0,
        immediate,
      });
      setPipeline({
        stage: 'done',
        message: immediate
          ? `Listo: ${createdCount} publicación(es) en cola de publicación`
          : `Listo: ${createdCount} publicación(es) programadas · ~${body.schedule_horizon_days ?? 1} día(s) de horizonte (1/hora por cuenta)`,
      });
      if (skippedCount > 0) {
        toast.warning(`${skippedCount} publicación(es) omitidas (límite diario o token) — revisa el detalle`);
      }
      toast.success('Modo automático completado 🎉');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error en el modo automático';
      setPipeline({ stage: 'error', message: msg });
      toast.error(msg);
    }
  };

  const toggleAccount = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const connectAccount = async (provider: Platform) => {
    try {
      const res = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'No se pudo iniciar la conexión');
      // Redirección externa (OAuth de la red social) — requiere full page load.
      window.location.assign(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al conectar');
    }
  };

  const handlePublish = async () => {
    const ready = files.filter((f) => f.mediaId && f.uploadStatus === 'ready');
    if (ready.length === 0) {
      toast.error('Sube al menos un video');
      return;
    }
    if (selected.size === 0) {
      toast.error('Selecciona al menos una cuenta');
      return;
    }
    const notProcessed = ready.filter((f) => f.processStatus !== 'done');
    if (notProcessed.length > 0) {
      toast.warning('Algunos videos aún no terminan de procesarse; se intentará igualmente');
    }
    let scheduledIso: string | undefined;
    if (publishMode === 'schedule') {
      const d = scheduledAt ? new Date(scheduledAt) : null;
      if (!d || Number.isNaN(d.getTime()) || d.getTime() < Date.now()) {
        toast.error('Elige una fecha y hora futura');
        return;
      }
      scheduledIso = d.toISOString();
    }

    const chosen = accounts.filter((a) => selected.has(a.id));
    const rows: PublishRow[] = [];
    for (const f of ready) {
      for (const a of chosen) {
        rows.push({
          key: `${f.localId}:${a.id}`,
          fileName: f.fileName,
          account: `@${a.username}`,
          status: 'publishing',
          message: '',
        });
      }
    }
    setResults(rows);
    setPublishing(true);

    let ok = 0;
    let fail = 0;
    for (const f of ready) {
      for (const a of chosen) {
        const key = `${f.localId}:${a.id}`;
        try {
          const res = await fetch('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              social_account_id: a.id,
              media_id: f.mediaId,
              caption: buildCaption(f),
              scheduled_at: scheduledIso ?? null,
            }),
          });
          const body = (await res.json()) as {
            success?: boolean;
            message?: string;
            error?: string;
          };
          const done = body.success === true;
          if (done) ok++;
          else fail++;
          const status: PublishRow['status'] = done
            ? scheduledIso
              ? 'scheduled'
              : 'published'
            : 'failed';
          const message = body.message ?? body.error ?? '';
          setResults((prev) => prev.map((r) => (r.key === key ? { ...r, status, message } : r)));
        } catch (e) {
          fail++;
          const message = e instanceof Error ? e.message : 'Error de red';
          setResults((prev) =>
            prev.map((r) => (r.key === key ? { ...r, status: 'failed' as const, message } : r))
          );
        }
      }
    }
    setPublishing(false);
    if (fail === 0) {
      toast.success(`${ok} publicación(es) ${scheduledIso ? 'programada(s)' : 'completada(s)'} 🎉`);
    } else {
      toast.warning(`${ok} ok · ${fail} fallidos — revisa el detalle`);
    }
  };

  const readyCount = files.filter((f) => f.mediaId && f.uploadStatus === 'ready').length;
  const withAI = files.filter((f) => f.aiStatus === 'done').length;
  const uploadedCount = files.filter((f) => f.uploadStatus === 'ready').length;
  const step = readyCount === 0 ? 1 : withAI < readyCount ? 2 : 3;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/50 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan text-xs font-bold text-white">
              CS
            </span>
            CopyPasteSocial
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/content" className="rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
              Contenido
            </Link>
            <Link href="/publications" className="rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
              Publicaciones
            </Link>
            <Link href="/accounts" className="rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
              Cuentas
            </Link>
            <Link href="/compose" className="rounded-lg bg-primary/15 px-3 py-1.5 font-medium text-primary">
              Componer
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Componer publicación</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sube tus videos, deja que la IA escriba título, descripción y hashtags, y publica en todas tus cuentas.
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5 border-brand-purple/40 bg-brand-purple/10 text-brand-purple">
              <Sparkles size={12} /> IA integrada
            </Badge>
          </div>

          {/* Modo automático */}
          <Card glass className="mb-6 border-brand-purple/40">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan text-white">
                  <Zap size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Modo automático</p>
                  <p className="text-xs text-muted-foreground">
                    Suelta tus videos y todo se hace solo: subir → procesar → IA → publicar en tus cuentas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoMode((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    autoMode
                      ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-md'
                      : 'border border-border text-muted-foreground'
                  )}
                >
                  <Zap size={12} /> Automático: {autoMode ? 'ON' : 'OFF'}
                </button>
                {autoMode && (
                  <button
                    type="button"
                    onClick={() => setStagger((v) => !v)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                      stagger
                        ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-md'
                        : 'border border-border text-muted-foreground'
                    )}
                  >
                    <CalendarClock size={12} /> Espaciar 1/hora: {stagger ? 'ON' : 'OFF'}
                  </button>
                )}
              </div>

              {autoMode && (
                <div className="mt-3 rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                  {selected.size === 0 ? (
                    <span className="text-amber-500">
                      Selecciona al menos una cuenta en el paso 3 para que el modo automático pueda publicar.
                    </span>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        {(readyCount || files.length || 0)} video(s) × {selected.size} cuenta(s) ={' '}
                        {(readyCount || files.length || 0) * selected.size} publicación(es)
                      </span>
                      {stagger ? (
                        <>
                          {' '}· 1 cada 60 min por cuenta (respeta 25/día) · horizonte ~
                          {Math.max(1, Math.ceil((readyCount || files.length || 1) / 24))} día(s). El cron las publica
                          cuando vencen.
                        </>
                      ) : (
                        <>
                          {' '}· sin espaciar: las que superen el límite de 25/día por cuenta quedan omitidas (reintento
                          mañana).
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {pipeline.stage !== 'idle' && (
                <div
                  className={cn(
                    'mt-3 rounded-xl border p-3',
                    pipeline.stage === 'error'
                      ? 'border-destructive/40 bg-destructive/10'
                      : pipeline.stage === 'done'
                        ? 'border-green-500/40 bg-green-500/10'
                        : 'border-brand-purple/40 bg-brand-purple/10'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {pipeline.stage === 'done' ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : pipeline.stage === 'error' ? (
                      <XCircle size={16} className="text-destructive" />
                    ) : (
                      <LoaderCircle size={16} className="animate-spin text-brand-purple" />
                    )}
                    <p className="text-sm font-medium">{pipeline.message}</p>
                  </div>
                  {pipeline.stage !== 'error' && pipeline.stage !== 'done' && files.length > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan transition-all duration-500"
                          style={{
                            width: `${Math.round(
                              pipeline.stage === 'uploading'
                                ? (uploadedCount / files.length) * 33
                                : pipeline.stage === 'ai'
                                  ? 33 + (withAI / files.length) * 34
                                  : 67
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Subidos {uploadedCount}/{files.length} · IA {withAI}/{files.length} · Cuentas {selected.size}
                      </p>
                    </div>
                  )}
                  {pipeline.stage === 'done' && batchSummary && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {batchSummary.created} creadas · {batchSummary.skipped} omitidas ·{' '}
                      <Link href="/publications" className="text-primary underline-offset-2 hover:underline">
                        ver en Publicaciones
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { n: 1, label: 'Videos', icon: Film, active: true },
              { n: 2, label: 'IA', icon: Sparkles, active: step >= 2 },
              { n: 3, label: 'Publicar', icon: Send, active: step >= 3 },
            ].map((s) => (
              <div
                key={s.n}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-all',
                  s.active ? 'border-brand-purple/50 bg-brand-purple/5' : 'border-border opacity-50'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                    s.active
                      ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {s.n}
                </span>
                <s.icon size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UploadCloud size={18} className="text-brand-cyan" /> 1 · Tus videos
                  {files.length > 0 && <Badge size="sm">{files.length} archivo(s)</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  className={cn(
                    'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-all',
                    dragOver
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-border hover:border-brand-purple/50 hover:bg-accent/5'
                  )}
                >
                  {uploading ? (
                    <LoaderCircle size={28} className="animate-spin text-brand-purple" />
                  ) : (
                    <UploadCloud size={28} className="text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">
                    {uploading ? 'Subiendo...' : 'Arrastra tus videos aquí o haz clic para elegir'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Máx. 100 MB por video · 50 por tanda · solo contenido propio o con licencia
                  </p>
                </button>

                {files.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {files.map((f) => (
                      <div key={f.localId} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                        <video src={f.previewUrl} muted playsInline className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{f.fileName}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {f.uploadStatus === 'uploading' && (
                              <Badge size="sm" status="CHECKING" variant="status">Subiendo</Badge>
                            )}
                            {f.uploadStatus === 'ready' && f.processStatus === 'done' && (
                              <Badge size="sm" status="ACCESSIBLE" variant="status">Listo</Badge>
                            )}
                            {f.uploadStatus === 'ready' &&
                              (f.processStatus === 'processing' || f.processStatus === 'pending') && (
                                <Badge size="sm" status="CHECKING" variant="status">Procesando</Badge>
                              )}
                            {(f.uploadStatus === 'error' || f.processStatus === 'failed') && (
                              <Badge size="sm" status="UNAVAILABLE" variant="status">
                                <XCircle size={10} /> {f.uploadError ? 'Error subida' : 'Fallo proceso'}
                              </Badge>
                            )}
                            {f.aiStatus === 'done' && (
                              <Badge size="sm" variant="default">
                                <Sparkles size={10} /> IA
                              </Badge>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(f.localId)}
                          className="h-7 w-7 shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Quitar"
                        >
                          <Trash2 size={14} className="mx-auto" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 size={18} className="text-brand-purple" /> 2 · IA: título, descripción y hashtags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Optimizar para:</span>
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-all',
                        platform === p.id
                          ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-md'
                          : 'border border-border text-muted-foreground hover:border-brand-purple/40 hover:text-foreground'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    variant="glow"
                    className="ml-auto"
                    disabled={uploading || files.length === 0}
                    onClick={() => void generateAllAI()}
                  >
                    <Sparkles size={14} /> Generar todo con IA
                  </Button>
                </div>

                {files.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sube videos para generar los metadatos con IA.</p>
                )}

                <div className="space-y-4">
                  {files.map((f) => (
                    <div key={f.localId} className="rounded-xl border border-border bg-card/60 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Film size={14} className="text-brand-cyan" />
                        <span className="truncate text-sm font-medium">{f.fileName}</span>
                        {f.aiStatus === 'loading' && <Spinner size={14} />}
                        <Button
                          size="icon-sm"
                          variant="outline"
                          className="ml-auto"
                          disabled={!f.mediaId || f.aiStatus === 'loading'}
                          onClick={() => void generateAI(f)}
                          title="Generar con IA"
                        >
                          <Sparkles size={14} className="text-brand-purple" />
                        </Button>
                      </div>
                      <div className="grid gap-3">
                        <div className="flex items-center gap-2">
                          <Type size={14} className="shrink-0 text-muted-foreground" />
                          <input
                            value={f.title}
                            onChange={(e) => updateFile(f.localId, { title: e.target.value })}
                            placeholder="Título..."
                            maxLength={100}
                            className="h-9 w-full rounded-lg border border-input bg-background/50 px-3 text-sm outline-none transition-all focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/30"
                          />
                        </div>
                        <div className="flex items-start gap-2">
                          <AlignLeft size={14} className="mt-2.5 shrink-0 text-muted-foreground" />
                          <textarea
                            value={f.description}
                            onChange={(e) => updateFile(f.localId, { description: e.target.value })}
                            placeholder="Descripción..."
                            rows={2}
                            maxLength={500}
                            className="w-full resize-none rounded-lg border border-input bg-background/50 px-3 py-2 text-sm outline-none transition-all focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/30"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Hash size={14} className="shrink-0 text-muted-foreground" />
                          <input
                            value={f.hashtagsText}
                            onChange={(e) => updateFile(f.localId, { hashtagsText: e.target.value })}
                            placeholder="#hashtags separados por espacios"
                            className="h-9 w-full rounded-lg border border-input bg-background/50 px-3 text-sm outline-none transition-all focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/30"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users size={18} className="text-brand-cyan" /> 3 · Cuentas y publicación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {accountsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size={14} /> Cargando cuentas...
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="text-sm font-medium text-amber-500">No hay cuentas conectadas</p>
                    <p className="mb-3 mt-1 text-xs text-muted-foreground">
                      Conecta al menos una red para publicar. Solo publicamos contenido tuyo o con licencia.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((p) => (
                        <Button key={p.id} size="sm" variant="outline" onClick={() => void connectAccount(p.id)}>
                          <Link2 size={12} /> Conectar {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {accounts.map((a) => {
                        const active = selected.has(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAccount(a.id)}
                            className={cn(
                              'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                              active ? 'border-brand-purple bg-brand-purple/10' : 'border-border hover:border-brand-purple/40'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white',
                                a.provider === 'youtube'
                                  ? 'bg-gradient-to-r from-[#FF0000] to-[#CC0000]'
                                  : a.provider === 'facebook'
                                    ? 'bg-blue-600'
                                    : a.provider === 'tiktok'
                                      ? 'bg-black'
                                      : 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]'
                              )}
                            >
                              {a.provider === 'youtube' ? 'YT' : a.provider === 'facebook' ? 'FB' : a.provider === 'tiktok' ? 'TT' : 'IG'}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">@{a.username}</span>
                              <span className="block text-xs capitalize text-muted-foreground">
                                {a.provider}
                                {typeof a.used_today === 'number' ? ` · ${a.used_today}/25 hoy` : ''}
                              </span>
                            </span>
                            {active && <CheckCircle2 size={18} className="shrink-0 text-brand-purple" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPublishMode('now')}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                          publishMode === 'now'
                            ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-md'
                            : 'border border-border text-muted-foreground'
                        )}
                      >
                        <Send size={12} /> Publicar ahora
                      </button>
                      <button
                        type="button"
                        onClick={() => setPublishMode('schedule')}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                          publishMode === 'schedule'
                            ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-md'
                            : 'border border-border text-muted-foreground'
                        )}
                      >
                        <CalendarClock size={12} /> Programar
                      </button>
                      {publishMode === 'schedule' && (
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="h-9 rounded-lg border border-input bg-background/50 px-3 text-sm outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/30"
                        />
                      )}
                    </div>

                    <Button
                      variant="glow"
                      size="lg"
                      className="w-full"
                      disabled={publishing || uploading || readyCount === 0 || selected.size === 0}
                      onClick={() => void handlePublish()}
                    >
                      {publishing ? (
                        <>
                          <Spinner size={16} /> Publicando...
                        </>
                      ) : (
                        <>
                          <Send size={16} /> {publishMode === 'now' ? 'Publicar' : 'Programar'} en {selected.size}{' '}
                          cuenta(s) · {readyCount} video(s)
                        </>
                      )}
                    </Button>
                  </>
                )}

                {results.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-border bg-card/60 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock size={12} /> Detalle de publicación
                    </p>
                    {results.map((r) => (
                      <div key={r.key} className="flex items-center gap-2 text-sm">
                        {r.status === 'publishing' && (
                          <LoaderCircle size={14} className="animate-spin text-brand-cyan" />
                        )}
                        {r.status === 'published' && <CheckCircle2 size={14} className="text-green-500" />}
                        {r.status === 'scheduled' && <CalendarClock size={14} className="text-blue-400" />}
                        {r.status === 'failed' && <XCircle size={14} className="text-destructive" />}
                        <span className="min-w-0 flex-1 truncate">
                          {r.fileName} → {r.account}
                        </span>
                        <span className="max-w-[45%] truncate text-xs text-muted-foreground" title={r.message}>
                          {r.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            CopyPasteSocial publica únicamente contenido propio o con licencia. La IA sugiere metadatos; revísalos antes
            de publicar.
          </p>
        </motion.div>
      </main>
    </div>
  );
}