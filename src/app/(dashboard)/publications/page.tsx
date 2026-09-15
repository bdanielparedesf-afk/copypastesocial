'use client';

/**
 * FASE 16 — Panel de Publicaciones (/publications)
 *
 * Visor de historial de publicaciones con:
 *  - 4 bento cards de stats (Total / Exitosas / Fallidas / En proceso).
 *  - Tabs pills (Todos | Exitosas | Fallidas | En proceso) que filtran por el
 *    status derivado de los publication_jobs agregados.
 *  - Búsqueda ⌘K con glow violeta que filtra por título (caption) o external_id.
 *  - Tabla shadcn: Fecha (Geist Mono) | Título | Jobs (nº) | Estado (badge con
 *    dot pulsante) | Acciones (Ver → PublicationProgressModal).
 *  - Skeleton loader mientras carga GET /api/publications.
 *
 * Datos reales vía Supabase: GET /api/publications (publications + publication_jobs).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Command,
  Copy,
  Eye,
  History,
  LayoutGrid,
  LoaderCircle,
  RefreshCw,
  Search,
  SearchX,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton, Spinner } from '@/components/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { cn } from '@/utils';
import { PublicationProgressModal, type PublicationJob as ProgressJob } from '@/components/publishing/publication-progress-modal';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PublicationJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'processing'
  | 'uploading'
  | 'publishing'
  | 'success'
  | 'retrying';

export type PublicationStatus = 'pending' | 'processing' | 'published' | 'failed';

export type DerivedStatus = 'success' | 'failed' | 'processing';

export interface PublicationJob {
  id: string;
  publication_id: string;
  type: string;
  status: PublicationJobStatus;
  attempts: number;
  error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  provider?: string | null;
  external_id?: string | null;
  error_message?: string | null;
}

export interface Publication {
  id: string;
  user_id: string;
  source_id: string;
  social_account_id: string;
  caption: string;
  status: PublicationStatus;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  publication_jobs: PublicationJob[];
}

interface PublicationsApiResponse {
  success?: boolean;
  publications?: Publication[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_COLORS = {
  success: '#10B981',
  failed: '#EF4444',
  processing: '#06B6D4',
};

const STATUS_DISPLAY: Record<DerivedStatus, { label: string; color: string; pulse: boolean }> = {
  success: { label: 'Exitosa', color: STATUS_COLORS.success, pulse: false },
  failed: { label: 'Fallida', color: STATUS_COLORS.failed, pulse: false },
  processing: { label: 'En proceso', color: STATUS_COLORS.processing, pulse: true },
};

const STATUS_TABS: Array<{ id: 'all' | DerivedStatus; label: string; icon: LucideIcon }> = [
  { id: 'all', label: 'Todos', icon: LayoutGrid },
  { id: 'success', label: 'Exitosas', icon: CheckCircle2 },
  { id: 'failed', label: 'Fallidas', icon: XCircle },
  { id: 'processing', label: 'En proceso', icon: LoaderCircle },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const JOB_SUCCESS_STATUSES = new Set<string>([
  'success', 'completed',
]);
const JOB_FAILED_STATUSES = new Set<string>(['failed']);

function normalizeJobStatus(status: string | undefined): string {
  return (status ?? '').toLowerCase();
}

/**
 * Deriva el estado de una publicación a partir del agregado de sus jobs.
 *  - Todos los jobs SUCCESS/COMPLETED → exitosa
 *  - Todos los jobs FAILED          → fallida
 *  - Caso contrario (pendientes/running/retrying o mixto) → en proceso
 *  - Sin jobs → se basa en el status de la publicación.
 */
function deriveStatus(pub: Publication): DerivedStatus {
  const raw = (pub.publication_jobs ?? []).map((j) => normalizeJobStatus(j.status));

  if (raw.length === 0) {
    switch (pub.status) {
      case 'published':
        return 'success';
      case 'failed':
        return 'failed';
      default:
        return 'processing';
    }
  }

  const allSuccess = raw.every((s) => JOB_SUCCESS_STATUSES.has(s));
  if (allSuccess) return 'success';

  const allFailed = raw.every((s) => JOB_FAILED_STATUSES.has(s));
  if (allFailed) return 'failed';

  return 'processing';
}

function getTitle(pub: Publication): string {
  const caption = (pub.caption ?? '').trim();
  if (caption) return caption.split('\n')[0].slice(0, 100);
  return 'Publicación sin título';
}

function getExternalIds(pub: Publication): string[] {
  return (pub.publication_jobs ?? [])
    .map((j) => (j.external_id ? String(j.external_id) : ''))
    .filter(Boolean);
}

function jobCount(pub: Publication): number {
  return (pub.publication_jobs ?? []).length;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* Bento stat cards                                                    */
/* ------------------------------------------------------------------ */

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <Card className="border-[#262629] bg-[#151517] hover:border-[#3A3A3F] transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1A` }}
          >
            <Icon size={18} style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsRow({ pubs }: { pubs: Publication[] }) {
  const counts = useMemo(() => {
    const c = { all: pubs.length, success: 0, failed: 0, processing: 0 };
    for (const pub of pubs) {
      const s = deriveStatus(pub);
      if (s === 'success') c.success += 1;
      else if (s === 'failed') c.failed += 1;
      else c.processing += 1;
    }
    return c;
  }, [pubs]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-2 gap-4 sm:grid-cols-4"
    >
      <StatCard
        title="Total"
        value={counts.all}
        icon={History}
        color={STATUS_COLORS.processing}
      />
      <StatCard
        title="Exitosas"
        value={counts.success}
        icon={CheckCircle2}
        color={STATUS_COLORS.success}
      />
      <StatCard
        title="Fallidas"
        value={counts.failed}
        icon={XCircle}
        color={STATUS_COLORS.failed}
      />
      <StatCard
        title="En proceso"
        value={counts.processing}
        icon={LoaderCircle}
        color={STATUS_COLORS.processing}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Status pill with pulsing dot                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: DerivedStatus }) {
  const cfg = STATUS_DISPLAY[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', cfg.pulse && 'animate-pulse')}
        style={{ backgroundColor: cfg.color }}
      />
      <span style={{ color: cfg.color }}>{cfg.label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="border-b border-border bg-card/40 rounded-xl p-4">
        <div className="grid grid-cols-12 gap-4">
          <Skeleton className="h-4 w-20 col-span-1" />
          <Skeleton className="h-4 w-48 col-span-5" />
          <Skeleton className="h-4 w-12 col-span-2" />
          <Skeleton className="h-4 w-24 col-span-2" />
          <Skeleton className="h-4 w-16 col-span-2" />
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border border-border bg-card/40 rounded-xl p-4">
          <div className="grid grid-cols-12 gap-4">
            <Skeleton className="h-4 w-24 col-span-1" />
            <Skeleton className="h-4 w-64 col-span-5" />
            <Skeleton className="h-4 w-10 col-span-2" />
            <Skeleton className="h-4 w-28 col-span-2" />
            <Skeleton className="h-4 w-14 col-span-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs pills                                                          */
/* ------------------------------------------------------------------ */

function StatusTabs({
  active,
  onChange,
  counts,
}: {
  active: 'all' | DerivedStatus;
  onChange: (tab: 'all' | DerivedStatus) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1">
      {STATUS_TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200',
              isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="status-pill"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple to-brand-purple/70 shadow-lg shadow-brand-purple/30"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <tab.icon size={13} />
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[10px]',
                  isActive ? 'bg-white/20 text-white' : 'bg-muted/60 text-muted-foreground'
                )}
              >
                {counts[tab.id] ?? 0}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Command-K search                                                    */
/* ------------------------------------------------------------------ */

function CommandSearch({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="relative w-full max-w-md">
      <Search
        size={14}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por título o external_id..."
        aria-label="Buscar publicaciones"
        className={cn(
          'h-10 w-full rounded-full border border-border bg-muted/30 pl-9 pr-12 text-sm text-foreground',
          'placeholder:text-muted-foreground/70 transition-all duration-200',
          'focus:border-brand-purple/50 focus:outline-none focus:ring-2 focus:ring-brand-purple/30',
          'focus:[box-shadow:0_0_40px_-8px_rgba(124,58,237,0.5)]'
        )}
      />
      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {!value && (
          <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            <Command size={11} />
            ⌘K
          </kbd>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpiar búsqueda"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Publications table                                                  */
/* ------------------------------------------------------------------ */

function PublicationsTable({
  pubs,
  onView,
}: {
  pubs: Publication[];
  onView: (pub: Publication) => void;
}) {
  if (pubs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
      >
        <SearchX size={40} className="text-muted-foreground/50" />
        <p className="text-lg font-medium text-white">No se encontraron publicaciones</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ajusta los filtros o la búsqueda para ver resultados.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Fecha
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Título
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Jobs
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Estado
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">
              Acciones
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pubs.map((pub) => {
            const status = deriveStatus(pub);
            const title = getTitle(pub);
            const extIds = getExternalIds(pub);
            return (
              <TableRow key={pub.id}>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatDate(pub.created_at)}
                  <span className="block text-xs text-muted-foreground/60">{formatTime(pub.created_at)}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="block max-w-[26rem] truncate text-sm font-medium text-foreground">
                      {title}
                    </span>
                    {extIds.length > 0 && (
               <Badge variant="outline" size="sm">
                    <Copy size={9} className="mr-1" />
                    {extIds.length}
                  </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-muted-foreground">
                    {jobCount(pub)}
                  </span>
                </TableCell>
               <TableCell>
                  <StatusBadge status={status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Ver ${title}`}
                    onClick={() => onView(pub)}
                    className="h-7 w-7 rounded-full p-0"
                  >
                    <Eye size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function PublicationsPage() {
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [processingQueue, setProcessingQueue] = useState<boolean>(false);
  const [queueResult, setQueueResult] = useState<string | null>(null);
  const [queueCounts, setQueueCounts] = useState<{ pending: number; retrying: number; success: number } | null>(null);

  const [statusTab, setStatusTab] = useState<'all' | DerivedStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [viewingPub, setViewingPub] = useState<Publication | null>(null);

  const fetchPubs = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/publications', { cache: 'no-store' });
      const body = (await res.json()) as Publication[] | PublicationsApiResponse;

      let list: Publication[];
      if (Array.isArray(body)) {
        list = body;
      } else if (body && typeof body === 'object' && Array.isArray(body.publications)) {
        list = body.publications;
      } else {
        list = [];
      }
      setPubs(list);
    } catch {
      setError('No se pudieron cargar las publicaciones. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleProcessQueue = useCallback(async () => {
    setProcessingQueue(true);
    setQueueResult(null);
    try {
      const res = await fetch('/api/cron/processQueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();
      if (!res.ok) {
        setQueueResult(`Error: ${body.error ?? 'processQueue falló'}`);
      } else {
        setQueueResult(`Cola procesada: ${body.processed ?? 0} jobs`);
      }
      void fetchPubs(true);
    } catch (e) {
      setQueueResult(`Error: ${e instanceof Error ? e.message : 'processQueue falló'}`);
    } finally {
      setProcessingQueue(false);
    }
  }, [fetchPubs]);

  // FASE 18.2: Obtener conteo de jobs en cola
  const fetchQueueCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/publications/queue-counts', { cache: 'no-store' });
      if (res.ok) {
        const body = await res.json();
        setQueueCounts({
          pending: body.pending ?? 0,
          retrying: body.retrying ?? 0,
          success: body.success ?? 0,
        });
      }
    } catch {
      // Silently fail - counts are optional
    }
  }, []);

  useEffect(() => {
    void fetchQueueCounts();
    const interval = setInterval(() => {
      void fetchQueueCounts();
    }, 10_000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchQueueCounts]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchPubs();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchPubs]);

  // ⌘K / Ctrl+K focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: pubs.length, success: 0, failed: 0, processing: 0 };
    for (const pub of pubs) {
      const s = deriveStatus(pub);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [pubs]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return pubs.filter((pub) => {
      if (statusTab !== 'all' && deriveStatus(pub) !== statusTab) return false;
      if (query) {
        const titleMatch = getTitle(pub).toLowerCase().includes(query);
        const extMatch = getExternalIds(pub).some((id) => id.toLowerCase().includes(query));
        if (!titleMatch && !extMatch) return false;
      }
      return true;
    });
  }, [pubs, statusTab, searchQuery]);

  const progressJobs: ProgressJob[] = useMemo(() => {
    return (viewingPub?.publication_jobs ?? []).map((j) => {
      let status: ProgressJob['status'];
      const s = normalizeJobStatus(j.status);
      if (s === 'success' || s === 'completed') status = 'success';
      else if (s === 'failed') status = 'failed';
      else if (s === 'pending') status = 'pending';
      else status = 'processing';
      return {
         id: j.id,
        mediaTitle: getTitle(viewingPub!),
        provider: ((j.provider ?? j.payload?.provider) as ProgressJob['provider']) ?? 'instagram',
        status,
        externalId: j.external_id ?? null,
        error: j.error ?? j.error_message ?? null,
      };
    });
  }, [viewingPub]);

  return (
    <>
      <main className="min-h-screen space-y-8 p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-white">Publicaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historial de tus publicaciones y el estado de cada job asociado.
          </p>
        </motion.div>

        {/* Estadísticas (bento cards) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <StatsRow pubs={pubs} />
        </motion.div>

        {/* Toolbar: tabs + búsqueda */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <StatusTabs active={statusTab} onChange={setStatusTab} counts={counts} />
<div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleProcessQueue}
              disabled={processingQueue || loading}
              aria-label="Procesar cola de publicaciones"
            >
              {processingQueue ? <Spinner size={14} /> : <RefreshCw size={14} />}
              {processingQueue ? 'Procesando…' : 'PROCESAR COLA'}
            </Button>
            {queueCounts && (
              <div className="flex items-center gap-2 text-xs">
                <span className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5",
                  queueCounts.pending > 0
                    ? "bg-[#06B6D4]/20 text-[#06B6D4] animate-pulse"
                    : "bg-[#52525B]/20 text-[#52525B]"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    queueCounts.pending > 0 ? "bg-[#06B6D4]" : "bg-[#52525B]"
                  )} />
                  {queueCounts.pending}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[#F59E0B]/20 px-2 py-0.5 text-[#F59E0B]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                  {queueCounts.retrying}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[#10B981]/20 px-2 py-0.5 text-[#10B981]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                  {queueCounts.success}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchPubs(true)}
              disabled={refreshing || loading}
              aria-label="Actualiza"
            >
              {refreshing ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </Button>
            <CommandSearch value={searchQuery} onChange={setSearchQuery} inputRef={searchInputRef} />
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}

        {queueResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
          >
            {queueResult}
          </motion.div>
        )}

        {/* Content */}
        {loading ? (
          <TableSkeleton />
        ) : (
          <PublicationsTable pubs={filtered} onView={(pub) => setViewingPub(pub)} />
        )}
      </main>

      {/* Detalle de jobs (reutiliza PublicationProgressModal como snapshot) */}
      <PublicationProgressModal
        isOpen={!!viewingPub}
        publicationId={null}
        jobs={progressJobs}
        total={progressJobs.length}
        onClose={() => setViewingPub(null)}
        onRetryFailed={async (failedIds) => {
          if (failedIds.length === 0) return;
          await fetch('/api/publications/retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ failed_ids: failedIds }),
          });
          void fetchPubs(true);
        }}
      />
    </>
  );
}
