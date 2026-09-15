'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Circle,
  RefreshCw,
  X,
  AlertCircle,
  Terminal,
  Loader2,
} from 'lucide-react';
import { cn } from '@/utils';
import type { ProviderId } from '@/types';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'uploading'
  | 'publishing'
  | 'success'
  | 'failed'
  | 'retrying';

export interface PublicationJob {
  id: string;
  mediaTitle: string;
  provider: ProviderId;
  status: JobStatus;
  externalId?: string | null;
  error?: string | null;
}

export interface PublicationProgressModalProps {
  isOpen: boolean;
  publicationId?: string | null;
  jobs: PublicationJob[];
  total: number;
  onClose: () => void;
  onRetryFailed: (failedIds: string[]) => void;
}

/* ------------------------------------------------------------------ */
/* Provider constants                                                  */
/* ------------------------------------------------------------------ */

const PROVIDER_BADGE: Record<ProviderId, string> = {
  instagram: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
  youtube: 'bg-red-600',
  facebook: 'bg-blue-600',
  tiktok: 'bg-black border border-white/20',
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  instagram: 'IG',
  youtube: 'YT',
  facebook: 'FB',
  tiktok: 'TT',
};

/* ------------------------------------------------------------------ */
/* Status icon (colores exactos)                                       */
/* ------------------------------------------------------------------ */

const STATUS_COLORS = {
  success: '#10B981',
  failed: '#EF4444',
  pending: '#52525B',
  publishing: '#7C3AED',
  processing: '#7C3AED',
  uploading: '#7C3AED',
  retrying: '#F59E0B',
};

function StatusIcon({ status }: { status: JobStatus }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.pending;

  switch (status) {
    case 'success':
      return (
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}20` }}
        >
          <Check size={12} style={{ color }} strokeWidth={3} />
        </span>
      );
    case 'failed':
      return (
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}20` }}
        >
          <AlertCircle size={12} style={{ color }} />
        </span>
      );
    case 'pending':
      return (
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}20` }}
        >
          <Circle size={10} style={{ color }} />
        </span>
      );
    case 'publishing':
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <Loader2 size={13} className="animate-spin" style={{ color }} />
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <RefreshCw size={13} className="animate-spin" style={{ color }} />
        </span>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Progress bar (gradient animated)                                    */
/* ------------------------------------------------------------------ */

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/60">
          {done}/{total} publicaciones
        </span>
        <span className="font-mono text-white/80">{pct}%</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        />
        {pct > 0 && pct < 100 && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            style={{ width: '40%' }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Log line (terminal style)                                           */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'PENDING',
  processing: 'PROCESANDO',
  uploading: 'SUBIENDO',
  publishing: 'PUBLICANDO',
  success: 'ÉXITO',
  failed: 'FALLIDO',
  retrying: 'REINTENTANDO',
};

function StatusGlyph({ status }: { status: JobStatus }) {
  switch (status) {
    case 'success':
      return <span style={{ color: '#10B981' }}>✓</span>;
    case 'pending':
      return <span style={{ color: '#52525B' }}>○</span>;
    case 'publishing':
    case 'processing':
    case 'uploading':
    case 'retrying':
      return <span style={{ color: '#7C3AED' }} className="animate-spin inline-block">⟳</span>;
    case 'failed':
      return <span style={{ color: '#EF4444' }}>✗</span>;
    default:
      return <span style={{ color: '#52525B' }}>○</span>;
  }
}

function LogLine({ job, index }: { job: PublicationJob; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const isFailed = job.status === 'failed';
  const isRetrying = job.status === 'retrying';
  // FASE 18: Detectar mensaje de cuota YouTube
  const isYoutubeQuota =
    job.provider === 'youtube' &&
    job.error?.includes('Cuota YouTube llena');
  const color = STATUS_COLORS[job.status] ?? STATUS_COLORS.pending;
  const label = STATUS_LABEL[job.status] ?? job.status;
  const hasDetails = isFailed || isRetrying || job.externalId;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1 font-mono text-[11px] transition-colors',
          isFailed ? 'bg-red-500/5' : isYoutubeQuota ? 'bg-yellow-500/5' : 'hover:bg-white/[0.02]',
          hasDetails ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        <span className="w-4 shrink-0 text-right text-white/20">{String(index + 1).padStart(2, '0')}</span>
        <span className="text-white/30">│</span>
        <span className="shrink-0">
          <StatusGlyph status={job.status} />
        </span>
        <span className="truncate text-white/70">{job.mediaTitle}</span>
        <span className="text-white/30">|</span>
        <span className="shrink-0 font-semibold" style={{ color }}>
          {PROVIDER_LABEL[job.provider] ?? job.provider}
        </span>
        <span style={{ color }} className="shrink-0 font-medium">
          {label}
        </span>
        {(isFailed || isYoutubeQuota) && job.error && (
          <span className={cn('truncate', isYoutubeQuota ? 'text-yellow-400/70' : 'text-red-400/70')}>
            {job.error}
          </span>
        )}
        {hasDetails && (
          <ChevronDown
            size={11}
            className={cn(
              'ml-auto shrink-0 text-white/30 transition-transform duration-200',
              expanded && 'rotate-180'
            )}
          />
        )}
      </button>
      {expanded && (
        <div className="bg-black/30 px-8 py-2 font-mono text-[10px] text-white/50">
          {job.externalId && (
            <div>
              <span className="text-violet-400">external_id:</span>{' '}
              <span className="text-white/70">{job.externalId}</span>
            </div>
          )}
          {(isFailed || isYoutubeQuota) && job.error && (
            <div>
              <span className={isYoutubeQuota ? 'text-yellow-400' : 'text-red-400'}>error_message:</span>{' '}
              <span className="text-white/70">{job.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ModalHeader                                                         */
/* ------------------------------------------------------------------ */

function ModalHeader({
  allDone,
  failed,
  succeeded,
  pending,
  onClose,
}: {
  allDone: boolean;
  failed: number;
  succeeded: number;
  pending: number;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
          {allDone ? (
            failed > 0 ? (
              <AlertCircle size={16} className="text-amber-400" />
            ) : (
              <Check size={16} className="text-emerald-400" />
            )
          ) : (
            <RefreshCw size={16} className="animate-spin text-violet-400" />
          )}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">
            {allDone
              ? 'PUBLICACIÓN TERMINADA'
              : 'Publicando contenido...'}
          </h2>
          {!allDone && (
            <p className="text-xs text-white/50">
              {succeeded} exitosos &middot; {failed} fallidos &middot; {pending} pendientes
            </p>
          )}
        </div>
      </div>
      {allDone && (
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* JobList (terminal style)                                            */
/* ------------------------------------------------------------------ */

function JobList({ jobs }: { jobs: PublicationJob[] }) {
  return (
    <div className="mt-4 max-h-60 overflow-y-auto px-2">
      {jobs.map((job, i) => (
        <motion.div
          key={`${job.mediaTitle}-${job.provider}-${i}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/[0.02]"
        >
          <StatusIcon status={job.status} />
          <span className="truncate text-white/70">{job.mediaTitle}</span>
          <span className="ml-auto shrink-0">
            <span
              className={cn(
                'inline-flex h-5 w-8 items-center justify-center rounded text-[9px] font-bold text-white',
                PROVIDER_BADGE[job.provider] ?? 'bg-gray-600'
              )}
            >
              {PROVIDER_LABEL[job.provider] ?? job.provider}
            </span>
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TerminalLogs                                                        */
/* ------------------------------------------------------------------ */

function TerminalLogs({ jobs }: { jobs: PublicationJob[] }) {
  return (
    <div className="mt-2 border-t border-white/5">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-2">
        <Terminal size={12} className="text-violet-400" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
          Terminal Output
        </span>
        <span className="ml-auto text-[10px] text-white/20">{jobs.length} líneas</span>
      </div>
      <div className="max-h-44 overflow-y-auto bg-black/40 py-2 font-mono text-[11px]">
        {jobs.map((job, i) => (
          <LogLine key={`log-${i}`} job={job} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ModalFooter                                                         */
/* ------------------------------------------------------------------ */

function ModalFooter({
  failed,
  failedIds,
  onRetryFailed,
  onClose,
}: {
  failed: number;
  failedIds: string[];
  onRetryFailed: (ids: string[]) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-white/5 px-5 py-4">
      {failed > 0 && (
        <button
          type="button"
          onClick={() => onRetryFailed(failedIds)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <RefreshCw size={13} />
          REINTENTAR FALLIDOS
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500"
      >
        Cerrar
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti (subtle, framer-motion divs)                             */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = ['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

function Confetti() {
  const particles = React.useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: (i * 37) % 100,
        delay: ((i * 13) % 20) / 10,
        duration: 2.5 + ((i * 7) % 20) / 10,
        size: 4 + ((i * 3) % 6),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: (i * 47) % 360,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: p.x, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            y: ['0vh', '110vh'],
            opacity: [1, 1, 0],
            rotate: [0, p.rotate + 360],
            scale: [1, 0.9, 0.4],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SuccessScreen                                                       */
/* ------------------------------------------------------------------ */

function SuccessScreen({
  processed,
  succeeded,
  failed,
}: {
  processed: number;
  succeeded: number;
  failed: number;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15"
      >
        <Check size={32} className="text-emerald-400" strokeWidth={2.5} />
      </motion.div>
      <h2 className="text-2xl font-bold tracking-wide text-white">
        PUBLICACIÓN TERMINADA
      </h2>
      <div className="flex gap-8">
        <div className="text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="block text-4xl font-bold tabular-nums text-white"
          >
            {processed}
          </motion.span>
          <span className="text-xs uppercase tracking-wider text-white/40">
            Procesados
          </span>
        </div>
        <div className="text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="block text-4xl font-bold tabular-nums text-emerald-400"
          >
            {succeeded}
          </motion.span>
          <span className="text-xs uppercase tracking-wider text-white/40">
            Exitosos
          </span>
        </div>
        <div className="text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="block text-4xl font-bold tabular-nums text-red-400"
          >
            {failed}
          </motion.span>
          <span className="text-xs uppercase tracking-wider text-white/40">
            Fallidos
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main modal                                                          */
/* ------------------------------------------------------------------ */

export function PublicationProgressModal({
  isOpen,
  publicationId,
  jobs: initialJobs,
  total: initialTotal,
  onClose,
  onRetryFailed,
}: PublicationProgressModalProps) {
  const [internalJobs, setInternalJobs] = React.useState<PublicationJob[]>([]);
  const [internalTotal, setInternalTotal] = React.useState(0);
  const realtimeRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  /* Derived values: cuando hay publicationId usamos el estado interno
     actualizado por realtime/polling; si no, usamos las props iniciales. */
  const jobs = publicationId ? internalJobs : initialJobs;
  const total = publicationId ? internalTotal : initialTotal;

  /* Suscribirse a Supabase Realtime para publication_jobs */
  React.useEffect(() => {
    if (!isOpen || !publicationId) return;

    let cancelled = false;

    const fetchJobs = async () => {
      try {
        // Vía API (service-role): el cliente del navegador es anon y RLS
        // bloquearía publication_jobs/media_items; además media_items no
        // tiene columna title (el título vive en metadata).
        const res = await fetch(`/api/publications/${publicationId}/jobs`, {
          cache: 'no-store',
        });
        if (cancelled || !res.ok) return;
        const body = (await res.json()) as {
          jobs?: Array<{
            id: string;
            mediaTitle?: string;
            provider?: ProviderId;
            status?: string;
            externalId?: string | null;
            error?: string | null;
          }>;
        };
        if (!Array.isArray(body.jobs)) return;

        const mapped: PublicationJob[] = body.jobs.map((j) => ({
          id: j.id,
          mediaTitle: j.mediaTitle ?? 'Video',
          provider: j.provider ?? 'instagram',
          status: mapJobStatus(j.status),
          externalId: j.externalId ?? null,
          error: j.error ?? null,
        }));

        setInternalJobs(mapped);
        setInternalTotal(mapped.length);
      } catch {
        /* silently retry on next tick */
      }
    };

    /* Polling cada 2s (el realtime con cliente anon puede estar bloqueado
       por RLS; el polling no depende de la suscripción). */
    pollRef.current = setInterval(fetchJobs, 2000);

    /* Canal realtime (best-effort: acelera la actualización si RLS lo
       permite). */
    realtimeRef.current = supabase
      .channel(`publication-progress-${publicationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'publication_jobs',
          filter: `publication_id=eq.${publicationId}`,
        },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    /* Llamada inicial inmediata */
    fetchJobs();

    return () => {
      cancelled = true;
      if (realtimeRef.current) {
        realtimeRef.current.unsubscribe();
        realtimeRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen, publicationId]);

  const done = jobs.filter((j) => j.status === 'success' || j.status === 'failed').length;
  const succeeded = jobs.filter((j) => j.status === 'success').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;
  const allDone = total > 0 && done === total;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0B] shadow-2xl shadow-violet-500/10"
          >
            <ModalHeader
              allDone={allDone}
              failed={failed}
              succeeded={succeeded}
              pending={total - done}
              onClose={onClose}
            />

            {allDone ? (
              <div className="relative">
                <Confetti />
                <SuccessScreen
                  processed={total}
                  succeeded={succeeded}
                  failed={failed}
                />
              </div>
            ) : (
              <>
                {/* Contador grande */}
                <div className="flex items-center justify-center py-4">
                  <span className="text-5xl font-bold tabular-nums text-white">
                    {succeeded + failed}
                  </span>
                  <span className="mx-2 text-2xl text-white/30">/</span>
                  <span className="text-5xl font-bold tabular-nums text-white/50">
                    {total}
                  </span>
                </div>

                <div className="px-5 pb-4">
                  <ProgressBar done={done} total={total} />
                </div>
              </>
            )}

            <JobList jobs={jobs} />
            <TerminalLogs jobs={jobs} />

            {allDone && (
              <ModalFooter
                failed={failed}
                failedIds={jobs.filter((j) => j.status === 'failed').map((j) => j.id)}
                onRetryFailed={onRetryFailed}
                onClose={onClose}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function mapJobStatus(status: string | undefined | null): JobStatus {
  switch (status?.toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'processing':
    case 'running':
      return 'processing';
    case 'uploading':
      return 'uploading';
    case 'publishing':
      return 'publishing';
    case 'success':
    case 'completed':
      return 'success';
    case 'failed':
      return 'failed';
    case 'retrying':
      return 'retrying';
    default:
      return 'pending';
  }
}
