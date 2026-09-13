'use client';

/**
 * FASE 7 — Librería de Contenido (/content)
 *
 * Bento grid tech tipo Pinterest/Apple Photos:
 *  - Cards con thumbnail, duración, provider badge (IG gradient / YT rojo / FB azul).
 *  - Hover: overlay oscuro + play icon + checkbox animado (Framer Motion).
 *  - Click en card → selecciona. Barra flotante estilo Linear con glow violeta.
 *  - Filtros: tabs de plataforma, pills (Videos / Reels-Shorts / Duplicados),
 *    búsqueda ⌘K y orden (Recientes / Más largos / Más cortos).
 *  - Preview modal glass: video (si es accesible), caption, hashtags, metadata,
 *    source URL y aviso de duplicado con fecha de importación.
 *  - Skeleton loaders con shimmer violeta.
 *
 * Datos reales vía Supabase: GET /api/content · DELETE /api/content/[id]. Sin mocks.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { CSSProperties, RefObject, MouseEvent as ReactMouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  AlertTriangle,
  Check,
  CheckCheck,
  ClipboardPaste,
  Clock,
  Command,
  Copy,
  Film,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  MonitorPlay,
  ExternalLink,
  Play,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Spinner, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { cn } from '@/utils';
import type { ProviderId } from '@/types';
import { usePublication } from '@/hooks/use-publication';
import {
  PublicationProgressModal,
  type PublicationJob,
} from '@/components/publishing/publication-progress-modal';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ContentItem {
  id: string;
  sourceId: string;
  url: string;
  sourceUrl: string | null;
  externalId: string | null;
  contentHash: string | null;
  thumbnailUrl: string | null;
  type: 'video' | 'image' | 'carousel';
  duration: number | null;
  width: number | null;
  height: number | null;
  publishedAt: string | null;
  metadata: Record<string, unknown>;
  aiGeneratedCaption: string | null;
  aiGeneratedTitle: string | null;
  aiGeneratedHashtags: string[] | null;
  useAi: boolean;
  createdAt: string;
  source: {
    id: string;
    originalUrl: string;
    provider: ProviderId;
    identifier: string;
    contentType: string;
    status: string;
    createdAt: string;
  } | null;
}

interface ContentApiResponse {
  success: boolean;
  items: ContentItem[];
  error?: string;
}

interface DuplicateInfo {
  isDuplicate: boolean;
  firstImportedAt: string | null;
}

type ProviderTab = 'all' | ProviderId;
type TypeFilter = 'all' | 'video' | 'reel' | 'duplicate';
type SortMode = 'recent' | 'longest' | 'shortest';

/* FASE 17 — AI generation types */
type AiPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
type AiTone = 'viral' | 'professional' | 'funny';

const AI_PLATFORMS: Array<{ id: AiPlatform; label: string; short: string }> = [
  { id: 'instagram', label: 'Instagram', short: 'IG' },
  { id: 'facebook', label: 'Facebook', short: 'FB' },
  { id: 'tiktok', label: 'TikTok', short: 'TT' },
  { id: 'youtube', label: 'YouTube', short: 'YT' },
];

const AI_TONES: Array<{ id: AiTone; label: string }> = [
  { id: 'viral', label: 'Viral' },
  { id: 'professional', label: 'Profesional' },
  { id: 'funny', label: 'Divertido' },
];

/* FASE 16 — Publication History types */
interface PublicationHistoryItem {
  id: string;
  status: string;
  total_jobs: number;
  succeeded_jobs: number;
  failed_jobs: number;
  created_at: string;
  updated_at: string;
}

interface PublicationHistoryResponse {
  success: boolean;
  publications: PublicationHistoryItem[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Provider styles (IG gradient / YT rojo / FB azul)                   */
/* ------------------------------------------------------------------ */

const PROVIDER_STYLES: Record<ProviderId, { badge: string; short: string; name: string }> = {
  instagram: {
    badge: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
    short: 'IG',
    name: 'Instagram',
  },
  youtube: { badge: 'bg-red-600', short: 'YT', name: 'YouTube' },
  facebook: { badge: 'bg-[#1877F2]', short: 'FB', name: 'Facebook' },
  tiktok: { badge: 'bg-black border border-white/20', short: 'TT', name: 'TikTok' },
};

function providerOf(item: ContentItem): ProviderId {
  return item.source?.provider ?? 'instagram';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Fecha corta dd/MM (ej. "12/09") para el aviso de duplicados. */
function formatDay(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function metaString(item: ContentItem, keys: string[]): string | null {
  for (const key of keys) {
    const value = item.metadata[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function getCaption(item: ContentItem): string | null {
  return metaString(item, ['caption', 'description', 'text']);
}

function getTitle(item: ContentItem): string {
  const title = metaString(item, ['title', 'name']);
  if (title) return title;
  const caption = getCaption(item);
  if (caption) return caption.split('\n')[0].slice(0, 140);
  return item.source?.identifier ?? 'Sin título';
}

function getHashtags(item: ContentItem): string[] {
  const text = `${getTitle(item)} ${getCaption(item) ?? ''}`;
  const matches = text.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? [...new Set(matches)].slice(0, 12) : [];
}

/** Normalización ligera para comparar URLs entre items (sin query/hash/www). */
function normalizedUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const REEL_TYPES = new Set(['reel', 'reels', 'story', 'short', 'shorts']);

function isReelLike(item: ContentItem): boolean {
  const contentType = item.source?.contentType?.toLowerCase() ?? '';
  if (REEL_TYPES.has(contentType)) return true;
  const metaType =
    typeof item.metadata.contentType === 'string' ? item.metadata.contentType.toLowerCase() : '';
  return REEL_TYPES.has(metaType);
}

/** ¿La URL apunta a un archivo de video reproducible en <video>? */
function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/* ------------------------------------------------------------------ */
/* Índice de duplicados                                                */
/* ------------------------------------------------------------------ */

/**
 * Agrupa por content_hash / external_id / URL normalizada (las 3 claves de
 * dedup de la Fase 6). Si un grupo tiene >1 item, todos son duplicados entre
 * sí y reportan la fecha de la primera importación ("importado el 12/09").
 */
function buildDuplicateIndex(items: ContentItem[]): Map<string, DuplicateInfo> {
  const groups = new Map<string, ContentItem[]>();

  const push = (key: string | null | undefined, item: ContentItem) => {
    if (!key) return;
    const list = groups.get(key) ?? [];
    if (!list.some((i) => i.id === item.id)) list.push(item);
    groups.set(key, list);
  };

  for (const item of items) {
    push(item.contentHash, item);
    push(item.externalId, item);
    push(normalizedUrlForCompare(item.sourceUrl ?? item.url), item);
  }

  const index = new Map<string, DuplicateInfo>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const dates = group.map((i) => i.createdAt).sort();
    const firstImportedAt = dates[0] ?? null;
    for (const item of group) {
      index.set(item.id, { isDuplicate: true, firstImportedAt });
    }
  }
  return index;
}

/* ------------------------------------------------------------------ */
/* Bento layout helpers                                                */
/* ------------------------------------------------------------------ */

function aspectRatioStyle(item: ContentItem): CSSProperties | undefined {
  if (!item.width || !item.height) return undefined;
  const ratio = item.width / item.height;
  return { aspectRatio: `${Math.min(ratio, 16 / 9)}` };
}

function getMediaAspectClass(item: ContentItem): string {
  if (item.width && item.height) return '';
  if (item.type === 'video') return 'aspect-video';
  if (item.type === 'image') return 'aspect-square';
  return 'aspect-[4/5]';
}

/** Span bento: los items anchos (16:9+) ocupan 2 columnas; patrón de variedad. */
function getSpanClass(item: ContentItem, index: number): string {
  const ratio = item.width && item.height ? item.width / item.height : null;
  if (ratio !== null && ratio >= 1.6) return 'sm:col-span-2';
  if (index % 7 === 3) return 'sm:col-span-2';
  return '';
}

/* ------------------------------------------------------------------ */
/* Provider Badge                                                      */
/* ------------------------------------------------------------------ */

function ProviderBadge({ provider, className }: { provider: ProviderId; className?: string }) {
  const style = PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.instagram;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm',
        style.badge,
        className
      )}
    >
      {style.short}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Selection Checkbox (animado con Framer Motion)                      */
/* ------------------------------------------------------------------ */

function SelectionCheckbox({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: (e: ReactMouseEvent) => void;
}) {
  return (
    <motion.button
      type="button"
      data-select="true"
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={selected ? 'Deseleccionar' : 'Seleccionar'}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur-md transition-colors duration-200',
        selected
          ? 'border-brand-purple bg-brand-purple text-white shadow-lg shadow-brand-purple/50'
          : 'border-white/40 bg-white/10 text-transparent hover:bg-white/25'
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          >
            <Check size={14} strokeWidth={3} />
          </motion.span>
        ) : (
          <motion.span
            key="dot"
            className="h-1.5 w-1.5 rounded-full bg-white/50"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Content Card (bento)                                                */
/* ------------------------------------------------------------------ */

interface ContentCardProps {
  item: ContentItem;
  index: number;
  selected: boolean;
  duplicate: DuplicateInfo | undefined;
  onToggleSelect: (id: string) => void;
  onOpenPreview: (id: string) => void;
}

function ContentCard({
  item,
  index,
  selected,
  duplicate,
  onToggleSelect,
  onOpenPreview,
}: ContentCardProps) {
  const provider = providerOf(item);
  const title = getTitle(item);
  const duration = formatDuration(item.duration);
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={() => onToggleSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleSelect(item.id);
        }
      }}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/60',
        getSpanClass(item, index),
        selected
          ? 'border-brand-purple/80 ring-2 ring-brand-purple/60 glow-purple'
          : 'border-border hover:border-brand-purple/40 hover:shadow-lg hover:shadow-brand-purple/10'
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn('relative w-full overflow-hidden bg-ink-800', getMediaAspectClass(item))}
        style={aspectRatioStyle(item)}
      >
        {item.thumbnailUrl && !thumbFailed ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.thumbnailUrl}
            alt={title}
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink-800 to-ink-700">
            {item.type === 'image' ? (
              <ImageIcon size={26} className="text-muted-foreground" />
            ) : (
              <Film size={26} className="text-muted-foreground" />
            )}
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {item.type}
            </span>
          </div>
        )}

        {/* Hover overlay: oscuro + play */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
          <motion.button
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenPreview(item.id);
            }}
            aria-label="Abrir preview"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <Play size={24} fill="currentColor" />
          </motion.button>
        </div>

        {/* Checkbox: visible si seleccionado; también en hover */}
        <div
          className={cn(
            'absolute left-2.5 top-2.5',
            selected
              ? 'opacity-100'
              : 'opacity-0 transition-opacity duration-200 group-hover:opacity-100'
          )}
        >
          <SelectionCheckbox
            selected={selected}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(item.id);
            }}
          />
        </div>

        {/* Duración overlay */}
        {duration && (
          <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-sm">
            {duration}
          </div>
        )}

        {/* Badge duplicado (amarillo) */}
        {duplicate?.isDuplicate && (
          <span className="absolute right-2 top-2.5 inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
            <Copy size={9} />
            Duplicado
          </span>
        )}

        {/* Preview accesible en touch (sin hover) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreview(item.id);
          }}
          aria-label="Abrir preview"
          className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 md:hidden"
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>

      {/* Info */}
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-1.5">
          <ProviderBadge provider={provider} />
          <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {PROVIDER_STYLES[provider]?.name ?? provider}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatDay(item.createdAt)}
          </span>
        </div>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-foreground">
          {title}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton Cards (shimmer violeta)                                    */
/* ------------------------------------------------------------------ */

const SHIMMER =
  'absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-brand-purple/25 to-transparent bg-[length:200%_100%]';

function SkeletonCard({ index }: { index: number }) {
  const wide = index % 7 === 3;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-card/60',
        wide ? 'sm:col-span-2' : ''
      )}
    >
      <div className={cn('relative w-full overflow-hidden bg-muted/40', wide ? 'aspect-video' : 'aspect-[4/5]')}>
        <div className={SHIMMER} />
      </div>
      <div className="space-y-2 p-3">
        <div className="relative h-3 w-20 overflow-hidden rounded bg-muted/40">
          <div className={SHIMMER} />
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded bg-muted/40">
          <div className={SHIMMER} />
        </div>
        <div className="relative h-3 w-2/3 overflow-hidden rounded bg-muted/40">
          <div className={SHIMMER} />
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <SkeletonCard key={i} index={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pill genérica (filtros tecnológicos)                                */
/* ------------------------------------------------------------------ */

function Pill({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count?: number;
  accent?: 'violet' | 'yellow';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
        active
          ? accent === 'yellow'
            ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
            : 'border-brand-purple/60 bg-brand-purple/15 text-foreground shadow-sm shadow-brand-purple/20'
          : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon size={12} />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="font-mono text-[10px] opacity-70">{count}</span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Filter Bar (tabs + pills + búsqueda ⌘K + sort)                      */
/* ------------------------------------------------------------------ */

const PROVIDER_TABS: Array<{ id: ProviderTab; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
];

const SORT_MODES: Array<{ id: SortMode; label: string; icon: LucideIcon }> = [
  { id: 'recent', label: 'Recientes', icon: Clock },
  { id: 'longest', label: 'Más largos', icon: ArrowDownWideNarrow },
  { id: 'shortest', label: 'Más cortos', icon: ArrowUpNarrowWide },
];

interface FilterBarProps {
  providerTab: ProviderTab;
  onProviderChange: (tab: ProviderTab) => void;
  providerCounts: Record<string, number>;
  typeFilter: TypeFilter;
  onTypeFilterChange: (filter: TypeFilter) => void;
  sortBy: SortMode;
  onSortChange: (sort: SortMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  duplicateCount: number;
}

function FilterBar({
  providerTab,
  onProviderChange,
  providerCounts,
  typeFilter,
  onTypeFilterChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  searchInputRef,
  duplicateCount,
}: FilterBarProps) {
  return (
    <div className="mb-8 space-y-3">
      {/* Row 1: Tabs de plataforma + búsqueda */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1">
          {PROVIDER_TABS.map((tab) => {
            const active = providerTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onProviderChange(tab.id)}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200',
                  active ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="provider-tab-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple to-brand-purple/70 shadow-lg shadow-brand-purple/30"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {tab.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px font-mono text-[10px]',
                      active ? 'bg-white/20 text-white' : 'bg-muted/60 text-muted-foreground'
                    )}
                  >
                    {providerCounts[tab.id] ?? 0}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Búsqueda command-k */}
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por título o caption..."
            aria-label="Buscar en la librería"
            className="h-9 w-full rounded-full border border-border bg-muted/30 pl-9 pr-14 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand-purple/50 focus:bg-muted/50 focus:ring-2 focus:ring-brand-purple/30"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={13} />
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* Row 2: filtro por tipo + orden */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill
          active={typeFilter === 'all'}
          onClick={() => onTypeFilterChange('all')}
          icon={LayoutGrid}
          label="Todos"
        />
        <Pill
          active={typeFilter === 'video'}
          onClick={() => onTypeFilterChange('video')}
          icon={Film}
          label="Videos"
        />
        <Pill
          active={typeFilter === 'reel'}
          onClick={() => onTypeFilterChange('reel')}
          icon={Zap}
          label="Reels/Shorts"
        />
        <Pill
          active={typeFilter === 'duplicate'}
          onClick={() => onTypeFilterChange('duplicate')}
          icon={Copy}
          label="Duplicados"
          count={duplicateCount}
          accent="yellow"
        />

        <div className="ml-auto flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1">
          {SORT_MODES.map((mode) => {
            const active = sortBy === mode.id;
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onSortChange(mode.id)}
                className={cn(
                  'relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                  active ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sort-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-brand-purple/30 ring-1 ring-brand-purple/50"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon size={12} />
                  <span className="hidden sm:inline">{mode.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Selection Bar (estilo Linear, glow violeta)                         */
/* ------------------------------------------------------------------ */

function SelectionBar({
  count,
  onDeselectAll,
  onCopySelected,
  copying,
  accounts,
  selectedAccounts,
  onToggleAccount,
  onBulkAi,
  bulkAiGenerating,
  aiSelectedCount,
}: {
  count: number;
  onDeselectAll: () => void;
  onCopySelected: () => void;
  copying: boolean;
  accounts: Array<{ id: string; provider: ProviderId; username: string }>;
  selectedAccounts: string[];
  onToggleAccount: (id: string) => void;
  onBulkAi: () => void;
  bulkAiGenerating: boolean;
  aiSelectedCount: number;
}) {
  return (
    <motion.div
      initial={{ y: 90, opacity: 0, x: '-50%' }}
      animate={{ y: 0, opacity: 1, x: '-50%' }}
      exit={{ y: 90, opacity: 0, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="fixed bottom-6 left-1/2 z-50"
    >
      <div className="glass-strong flex items-center gap-4 rounded-2xl border border-brand-purple/25 px-5 py-3 glow-purple">
        <div className="flex items-center gap-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-purple"
          >
            <CheckCheck size={13} className="text-white" />
          </motion.div>
          <span className="whitespace-nowrap text-sm font-medium text-white">
            {count === 1 ? '1 seleccionado' : `${count} seleccionados`}
          </span>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* FASE 14 — Account selector */}
        {accounts.length > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              {accounts.map((acc) => {
                const isSelected = selectedAccounts.includes(acc.id);
                const badgeColor =
                  acc.provider === 'instagram'
                    ? 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]'
                    : acc.provider === 'youtube'
                      ? 'bg-red-600'
                      : acc.provider === 'facebook'
                        ? 'bg-blue-600'
                        : 'bg-black border border-white/20';
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => onToggleAccount(acc.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all',
                      isSelected
                        ? `${badgeColor} text-white shadow-md`
                        : 'bg-white/5 text-white/40 hover:text-white/70'
                    )}
                  >
                    {acc.provider === 'instagram'
                      ? 'IG'
                      : acc.provider === 'youtube'
                        ? 'YT'
                        : acc.provider === 'facebook'
                          ? 'FB'
                          : 'TT'}
                  </button>
                );
              })}
            </div>
            <div className="h-5 w-px bg-white/10" />
          </>
        )}

        {/* FASE 17 — IA Masiva */}
        <Button
          variant="glow"
          size="sm"
          onClick={onBulkAi}
          disabled={bulkAiGenerating}
          className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4]"
        >
          {bulkAiGenerating ? (
            <>
              <Spinner size={13} />
              IA Masiva...
            </>
          ) : (
            <>
              <Sparkles size={13} />
              ✨ IA Masiva
              {aiSelectedCount > 0 && (
                <span className="font-mono text-[10px]">({aiSelectedCount})</span>
              )}
            </>
          )}
        </Button>

        <Button variant="ghost" size="sm" onClick={onDeselectAll}>
          Deseleccionar
        </Button>

        <Button
          variant="glow"
          size="sm"
          onClick={onCopySelected}
          disabled={copying || selectedAccounts.length === 0}
        >
          {copying ? (
            <>
              <Spinner size={13} />
              Publicando...
            </>
          ) : (
            <>
              <ClipboardPaste size={13} />
              Fotocopiar Seleccionados
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview Modal (glass con blur)                                      */
/* ------------------------------------------------------------------ */

interface PreviewModalProps {
  item: ContentItem;
  selected: boolean;
  duplicate: DuplicateInfo | undefined;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSetUseAi: (itemId: string, caption: string) => void;
}

function PreviewModal({
  item,
  selected,
  duplicate,
  onClose,
  onDelete,
  onToggleSelect,
  onSetUseAi,
}: PreviewModalProps) {
  const title = getTitle(item);
  const caption = getCaption(item);
  const hashtags = getHashtags(item);
  const duration = formatDuration(item.duration);
  const provider = providerOf(item);
  const [linkCopied, setLinkCopied] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(item.source?.originalUrl ?? item.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  };

  /* FASE 17 — AI caption generation */
  const [aiTab, setAiTab] = useState<'original' | 'generate'>('original');
  const [aiPlatform, setAiPlatform] = useState<AiPlatform>('instagram');
  const [aiTone, setAiTone] = useState<AiTone>('viral');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedCaption, setAiGeneratedCaption] = useState<string>('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCopied, setAiCopied] = useState(false);
  const [aiUseClicked, setAiUseClicked] = useState(false);

  const videoUrl = useMemo(() => {
    if (item.type === 'video' && isDirectVideoUrl(item.url)) return item.url;
    return null;
  }, [item]);

  const metadata = item.metadata as Record<string, unknown>;
  const itemSelected = selected;
  const author =
    metaString(item, ['author', 'username', 'channelTitle']) ??
    (typeof metadata.author === 'object' && metadata.author !== null
      ? metaString(
          { ...(item as ContentItem), metadata: metadata.author as Record<string, unknown> },
          ['username', 'name']
        )
      : null);

  const handleGenerateAi = async () => {
    setAiGenerating(true);
    setAiError(null);
    setAiGeneratedCaption('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaItemIds: [item.id],
          action: 'caption',
          platform: aiPlatform,
          tone: aiTone,
        }),
      });
      const body = await res.json();
      if (res.ok && body.success && body.results?.[0]?.generated) {
        setAiGeneratedCaption(body.results[0].generated);
      } else {
        setAiError(body.error ?? 'Error al generar el caption');
      }
    } catch {
      setAiError('No se pudo contactar el servidor');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleUseAiCaption = async () => {
    if (!aiGeneratedCaption) return;
    try {
      await fetch(`/api/media/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_generated_caption: aiGeneratedCaption }),
      });
    } catch {
      /* El caption se guarda localmente aunque falle el PATCH */
    }
    onSetUseAi(item.id, aiGeneratedCaption);
    setAiUseClicked(true);
  };

  const handleCopyAiCaption = async () => {
    try {
      await navigator.clipboard.writeText(aiGeneratedCaption);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  };

  /* Cerrar con Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 shadow-2xl shadow-brand-purple/20"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/75"
        >
          <X size={15} />
        </button>

        {/* Media */}
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {videoUrl && !videoFailed ? (
            <video
              src={videoUrl}
              controls
              playsInline
              onError={() => setVideoFailed(true)}
              className="h-full w-full object-contain"
            />
          ) : item.thumbnailUrl && !thumbFailed ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbnailUrl}
                alt={title}
                onError={() => setThumbFailed(true)}
                className="h-full w-full object-cover opacity-85"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-lg">
                  {item.type === 'image' ? <ImageIcon size={26} /> : <Play size={28} fill="currentColor" />}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-800 to-ink-700">
              <MonitorPlay size={44} className="text-muted-foreground" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Vista previa no accesible
              </span>
            </div>
          )}

          {duration && (
            <div className="absolute bottom-3 right-3 rounded-lg bg-black/75 px-2 py-1 font-mono text-sm text-white backdrop-blur-sm">
              {duration}
            </div>
          )}

          {duplicate?.isDuplicate && (
            <div className="absolute left-3 top-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/20 px-2.5 py-1 text-xs font-semibold text-yellow-400 backdrop-blur-sm">
                <Copy size={11} />
                Duplicado
              </span>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="glass space-y-4 p-6">
          {/* Aviso de duplicado con fecha de importación */}
          {duplicate?.isDuplicate && (
            <div className="flex items-center gap-2 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
              <AlertTriangle size={16} className="shrink-0" />
              <span>
                Este contenido ya existe — importado el {formatDay(duplicate.firstImportedAt)}.
              </span>
            </div>
          )}

           {/* Título + provider + Tabs FASE 17 */}
           <div className="space-y-2">
             <div className="flex flex-wrap items-center gap-2">
               <ProviderBadge provider={provider} className="px-2 py-1 text-[10px]" />
               <span className="text-xs text-muted-foreground">
                 {PROVIDER_STYLES[provider]?.name ?? provider}
                 {item.source?.contentType ? ` · ${item.source.contentType}` : ''}
               </span>
               {author && <span className="text-xs text-muted-foreground">· @{author}</span>}
             </div>
             <h2 className="text-xl font-bold leading-snug text-white">{title}</h2>

             {/* FASE 17 — Tabs: USAR ORIGINAL | GENERAR CON IA */}
             <Tabs
               value={aiTab}
               onValueChange={(v) => setAiTab(v as 'original' | 'generate')}
               className="mt-3"
             >
               <TabsList className="mb-3 grid w-full grid-cols-2 border border-[#262629] bg-[#151517]">
                 <TabsTrigger
                   value="original"
                   className={cn(
                     'data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7C3AED] data-[state=active]:to-[#06B6D4]'
                   )}
                   data-state={aiTab === 'original' ? 'active' : 'inactive'}
                 >
                   USAR ORIGINAL
                 </TabsTrigger>
                 <TabsTrigger
                   value="generate"
                   className={cn(
                     'data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7C3AED] data-[state=active]:to-[#06B6D4]'
                   )}
                   data-state={aiTab === 'generate' ? 'active' : 'inactive'}
                 >
                   {'✨ GENERAR CON IA'}
                 </TabsTrigger>
               </TabsList>

               {/* Tab: Original caption */}
               <TabsContent value="original" className="mt-0">
                 {item.useAi && item.aiGeneratedCaption && (
                   <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-brand-purple/30 bg-brand-purple/10 px-3 py-2 text-xs text-brand-purple">
                     <Sparkles size={12} />
                     <span>Usando caption IA (activo)</span>
                   </div>
                 )}
                 {caption ? (
                   <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                     {caption}
                   </p>
                 ) : (
                   <p className="text-sm text-muted-foreground/60">Sin caption disponible</p>
                 )}
               </TabsContent>

               {/* Tab: IA generation */}
               <TabsContent value="generate" className="mt-0 space-y-3">
                 {/* Platform select */}
                 <div className="space-y-1.5">
                   <label className="text-xs font-medium text-muted-foreground">
                     Plataforma
                   </label>
                   <div className="flex flex-wrap gap-1.5">
                     {AI_PLATFORMS.map((p) => (
                       <button
                         key={p.id}
                         type="button"
                         onClick={() => setAiPlatform(p.id)}
                         className={cn(
                           'flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                           aiPlatform === p.id
                             ? 'border-brand-purple bg-brand-purple/15 text-white shadow-lg shadow-brand-purple/25'
                             : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                         )}
                       >
                         {p.short}
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* Tone select */}
                 <div className="space-y-1.5">
                   <label className="text-xs font-medium text-muted-foreground">
                     Tono
                   </label>
                   <div className="flex flex-wrap gap-1.5">
                     {AI_TONES.map((t) => (
                       <button
                         key={t.id}
                         type="button"
                         onClick={() => setAiTone(t.id)}
                         className={cn(
                           'rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                           aiTone === t.id
                             ? 'border-brand-purple bg-brand-purple/15 text-white shadow-lg shadow-brand-purple/25'
                             : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                         )}
                       >
                         {t.label}
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* Generate button: gradient #7C3AED → #06B6D4 con spinner */}
                 <Button
                   onClick={handleGenerateAi}
                   disabled={aiGenerating}
                   className="w-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white shadow-lg shadow-brand-purple/25"
                 >
                   {aiGenerating ? (
                     <>
                       <Spinner size={16} />
                       Generando...
                     </>
                   ) : (
                     <>
                       <Sparkles size={16} />
                       ✨ GENERAR
                     </>
                   )}
                 </Button>

                 {aiError && (
                   <p className="text-xs text-red-400">{aiError}</p>
                 )}

                 {/* Result card: glass bg-[#151517] border-[#262629] */}
                 {aiGeneratedCaption && (
                   <div className="rounded-2xl border border-[#262629] bg-[#151517] p-4 space-y-3">
                     <p className="whitespace-pre-line text-sm leading-relaxed text-white/90">
                       {aiGeneratedCaption}
                     </p>
                     <div className="flex gap-2">
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={handleCopyAiCaption}
                         className="border-[#262629] bg-[#1F1F22] hover:bg-[#2A2A2E]"
                       >
                         {aiCopied ? (
                           <>
                             <Check size={13} />
                             Copiado
                           </>
                         ) : (
                           <>
                             <Copy size={13} />
                             Copiar
                           </>
                         )}
                       </Button>
                       <Button
                         size="sm"
                         onClick={handleUseAiCaption}
                         disabled={aiUseClicked}
                         className={cn(
                           'bg-gradient-to-r from-[#7C3AED] to-[#06B6D4]',
                           aiUseClicked && 'opacity-60'
                         )}
                       >
                         {aiUseClicked ? (
                           <>
                             <Check size={13} />
                             ¡Usado!
                           </>
                         ) : (
                           <>
                             <Sparkles size={13} />
                             USAR ESTE
                           </>
                         )}
                       </Button>
                     </div>
                   </div>
                 )}
               </TabsContent>
             </Tabs>
           </div>

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-purple/15 px-2.5 py-1 text-xs font-medium text-brand-purple"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <span className="mb-0.5 block text-xs text-muted-foreground">Tipo</span>
              <span className="capitalize">{item.type}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <span className="mb-0.5 block text-xs text-muted-foreground">Duración</span>
              <span>{duration ?? 'N/A'}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <span className="mb-0.5 block text-xs text-muted-foreground">Resolución</span>
              <span>{item.width && item.height ? `${item.width}×${item.height}` : 'N/A'}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <span className="mb-0.5 block text-xs text-muted-foreground">Importado</span>
              <span>{formatDate(item.createdAt)}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <span className="mb-0.5 block text-xs text-muted-foreground">Publicado</span>
              <span>{item.publishedAt ? formatDate(item.publishedAt) : 'N/A'}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <span className="mb-0.5 block text-xs text-muted-foreground">Estado fuente</span>
              <span className="capitalize">{item.source?.status?.toLowerCase() ?? '—'}</span>
            </div>
          </div>

          {/* Source URL */}
          <a
            href={item.source?.originalUrl ?? item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-brand-purple/40 hover:text-foreground"
          >
            <Link2 size={13} className="shrink-0" />
            <span className="truncate font-mono">{item.source?.originalUrl ?? item.url}</span>
            <ExternalLink size={13} className="shrink-0" />
          </a>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={copyLink}>
              {linkCopied ? (
                <>
                  <Check size={14} />
                  Copiado
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copiar Link
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(item.source?.originalUrl ?? item.url);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch {
                  // clipboard no disponible
                }
              }}
            >
              <ClipboardPaste size={14} />
              Fotocopiar este
            </Button>
            <Button
              variant={itemSelected ? 'outline' : 'secondary'}
              size="sm"
              className="flex-1"
              onClick={() => onToggleSelect(item.id)}
            >
              {itemSelected ? (
                <>
                  <Check size={14} />
                  Seleccionado
                </>
              ) : (
                <>
                  <LayoutGrid size={14} />
                  Seleccionar
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => {
                setDeleting(true);
                onDelete(item.id);
              }}
            >
              {deleting ? <Spinner size={14} /> : <Trash2 size={14} />}
              Eliminar
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty State (tech, con ilustración)                                 */
/* ------------------------------------------------------------------ */

/** Ilustración SVG tech: grid bento flotante con glow violeta. */
function BentoIllustration() {
  return (
    <svg width="180" height="120" viewBox="0 0 180 120" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bento-glow" x1="0" y1="0" x2="180" y2="120">
          <stop stopColor="#7C3AED" stopOpacity="0.9" />
          <stop offset="1" stopColor="#06B6D4" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="bento-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1F1F22" />
          <stop offset="1" stopColor="#151517" />
        </linearGradient>
      </defs>
      <rect x="12" y="12" width="70" height="50" rx="10" fill="url(#bento-fill)" stroke="url(#bento-glow)" strokeWidth="1.4" />
      <rect x="92" y="12" width="40" height="50" rx="10" fill="url(#bento-fill)" stroke="#3A3A3F" strokeWidth="1.2" />
      <rect x="142" y="12" width="26" height="50" rx="10" fill="url(#bento-fill)" stroke="#3A3A3F" strokeWidth="1.2" />
      <rect x="12" y="72" width="40" height="36" rx="10" fill="url(#bento-fill)" stroke="#3A3A3F" strokeWidth="1.2" />
      <rect x="62" y="72" width="100" height="36" rx="10" fill="url(#bento-fill)" stroke="#3A3A3F" strokeWidth="1.2" />
      <polygon points="40,30 56,37 40,44" fill="url(#bento-glow)" />
      <circle cx="112" cy="37" r="10" stroke="url(#bento-glow)" strokeWidth="1.4" />
      <path d="M112 27v20M102 37h20" stroke="url(#bento-glow)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-card/40 py-20"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.35), transparent 60%)',
        }}
      />
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <BentoIllustration />
      </motion.div>
      <h3 className="mt-4 text-xl font-bold text-white">Tu librería está vacía</h3>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        Pega una URL en el Dashboard para comenzar a importar contenido social.
      </p>
      <Link href="/" className="mt-6">
        <Button variant="glow" size="lg">
          <Plus size={16} />
          Pega una URL en el Dashboard
        </Button>
      </Link>
      <p className="mt-4 flex items-center gap-1 font-mono text-[11px] text-muted-foreground/70">
        <Command size={11} />
        Check → Import → aparece aquí
      </p>
    </motion.div>
  );
}

function NoResults({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <SearchX size={44} className="mb-4 text-muted-foreground" />
      <p className="text-lg font-medium text-white">No se encontraron resultados</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Intenta cambiar los filtros o la búsqueda.
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={onClearFilters}>
        <RefreshCw size={13} />
        Limpiar filtros
      </Button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE 18 — Local Upload Dropzone                                     */
/* ------------------------------------------------------------------ */

function LocalUploadDropzone({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  uploading,
  progress,
  fileInputRef,
}: {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: () => void;
  uploading: boolean;
  progress: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.4 }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all duration-200',
        isDragOver
          ? 'border-brand-purple bg-brand-purple/10 scale-[1.02]'
          : 'border-border hover:border-brand-purple/50 hover:bg-white/[0.02]',
        uploading && 'pointer-events-none opacity-70'
      )}
      onClick={onFileSelect}
      role="button"
      tabIndex={0}
      aria-label="Subir desde mi PC"
    >
      <input
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        multiple
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onDrop({ preventDefault: () => {}, dataTransfer: { files: e.target.files } } as unknown as React.DragEvent);
          }
        }}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Spinner size={24} />
          <span className="text-sm text-white/70">{progress}</span>
        </div>
      ) : (
        <>
          <div className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
            isDragOver ? 'bg-brand-purple/20' : 'bg-white/5'
          )}>
            <Upload size={24} className={isDragOver ? 'text-brand-purple' : 'text-white/50'} />
          </div>
          <p className="mt-3 text-sm font-medium text-white">
            {isDragOver ? '¡Suelta aquí!' : 'Subir desde mi PC'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Arrastra archivos o haz clic para seleccionar
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/50">
            Video · Imagen · Máx 100MB
          </p>
        </>
      )}

      {progress && !uploading && (
        <p className={cn(
          'mt-2 text-xs',
          progress.startsWith('✓') ? 'text-emerald-400' : 'text-destructive'
        )}>
          {progress}
        </p>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Página principal                                                    */
/* ------------------------------------------------------------------ */

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [providerTab, setProviderTab] = useState<ProviderTab>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortMode>('recent');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);

  /* FASE 17 — Local flag: items that should use AI-generated caption for publishing */
  const [useAiIds, setUseAiIds] = useState<Set<string>>(new Set());
  const [bulkAiGenerating, setBulkAiGenerating] = useState(false);

  /* FASE 16 — Publication History state */
  const [historyPublications, setHistoryPublications] = useState<PublicationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  /* FASE 14 — Publication state */
  const pub = usePublication();
  const [accounts, setAccounts] = useState<
    Array<{ id: string; provider: ProviderId; username: string }>
  >([]);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [publicationId, setPublicationId] = useState<string | null>(null);
  const [publicationJobs, setPublicationJobs] = useState<PublicationJob[]>([]);
  const [publicationTotal, setPublicationTotal] = useState(0);
  const [publishing, setPublishing] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  /* FASE 18 — Local file upload state */
  const [isDragOver, setIsDragOver] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const [localUploadProgress, setLocalUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/content', { cache: 'no-store' });
      const body: ContentApiResponse = await res.json();
      if (res.ok && body.success && Array.isArray(body.items)) {
        const mapped = body.items.map((i) => ({ ...i, useAi: false }));
        setItems(mapped);

        // Preseleccionar videos importados desde el perfil (botón Fotocopiar del
        // ProfileImporter guarda sus media_ids en localStorage). Se consumen una vez.
        try {
          const raw = localStorage.getItem('copypastesco_selected_media');
          if (raw) {
            localStorage.removeItem('copypastesco_selected_media');
            const stored = JSON.parse(raw) as string[];
            if (Array.isArray(stored) && stored.length > 0) {
              const ids = stored.filter((id) => mapped.some((i) => i.id === id));
              if (ids.length > 0) {
                setSelectedIds(new Set(ids));
                pub.setSelectedMedia(ids);
                toast.success(
                  `${ids.length} videos importados del perfil — selecciona tus cuentas y pulsa Fotocopiar`
                );
              }
            }
          }
        } catch {
          // localStorage corrupto o sin permisos: ignorar silenciosamente.
        }
      } else {
        setError(body.error ?? 'No se pudo cargar la librería de contenido.');
      }
    } catch {
      setError('Ocurrió un error al contactar el servidor. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /* FASE 18 — Local file upload handler */
  const handleLocalUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setLocalUploading(true);
    setLocalUploadProgress(`Subiendo ${fileArray.length} archivo(s)...`);

    try {
      const formData = new FormData();
      for (const file of fileArray) {
        formData.append('files', file);
      }

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      const body = await res.json();

      if (res.ok && body.success) {
        setLocalUploadProgress(`✓ ${body.imported} archivo(s) subido(s) correctamente`);
        toast.success(`${body.imported} videos en cola - Click PROCESAR COLA en /publications`);
        // Recargar contenido
        await fetchData(true);
        // Limpiar progreso después de 3s
        setTimeout(() => setLocalUploadProgress(null), 3000);
      } else {
        setLocalUploadProgress(`Error: ${body.error ?? 'No se pudieron subir los archivos'}`);
        setTimeout(() => setLocalUploadProgress(null), 5000);
      }
    } catch {
      setLocalUploadProgress('Error de conexión al subir archivos');
      setTimeout(() => setLocalUploadProgress(null), 5000);
    } finally {
      setLocalUploading(false);
    }
  }, [fetchData]);

  /* FASE 16 — Fetch publication history */
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/publications', { cache: 'no-store' });
      const body: PublicationHistoryResponse = await res.json();
      if (res.ok && body.success && Array.isArray(body.publications)) {
        setHistoryPublications(body.publications);
      } else {
        setHistoryError(body.error ?? 'No se pudo cargar el historial.');
      }
    } catch {
      setHistoryError('Ocurrió un error al contactar el servidor.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    /* Carga inicial diferida (evita setState síncrono en el body del effect). */
    const t = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchData]);

  /* FASE 18 — Drag and drop handlers */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleLocalUpload(files);
    }
  }, [handleLocalUpload]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /* Atajo ⌘K / Ctrl+K para enfocar la búsqueda */
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

  /* FASE 14 — Cargar cuentas sociales */
  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((body: { success?: boolean; accounts?: Array<{ id: string; provider: ProviderId; username: string }> }) => {
        if (body.success && Array.isArray(body.accounts)) {
          setAccounts(body.accounts);
        }
      })
      .catch(() => {
        /* sin cuentas: selector vacío */
      });
  }, []);

  const duplicateIndex = useMemo(() => buildDuplicateIndex(items), [items]);

  const duplicateCount = useMemo(
    () => [...duplicateIndex.keys()].length,
    [duplicateIndex]
  );

  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: items.length,
      instagram: 0,
      youtube: 0,
      facebook: 0,
      tiktok: 0,
    };
    for (const item of items) {
      const p = providerOf(item);
      if (counts[p] === undefined) counts[p] = 0;
      counts[p] += 1;
    }
    return counts;
  }, [items]);

  const historyCounts = useMemo(() => ({
    total: historyPublications.length,
    failed: historyPublications.filter((p) => p.failed_jobs > 0).length,
  }), [historyPublications]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = items.filter((item) => {
      if (providerTab !== 'all' && providerOf(item) !== providerTab) return false;
      if (typeFilter === 'video' && item.type !== 'video') return false;
      if (typeFilter === 'reel' && !isReelLike(item)) return false;
      if (typeFilter === 'duplicate' && !duplicateIndex.get(item.id)?.isDuplicate) return false;
      if (query) {
        const haystack = `${getTitle(item)} ${getCaption(item) ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (sortBy === 'longest') {
      result = [...result].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    } else if (sortBy === 'shortest') {
      result = [...result].sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
    }
    return result;
  }, [items, providerTab, typeFilter, duplicateIndex, searchQuery, sortBy]);

  const previewItem = useMemo(
    () => items.find((i) => i.id === previewId) ?? null,
    [items, previewId]
  );

  /* ---------------- Selección ---------------- */

  /* FASE 14 — Selección de media vía toggleSelect */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        pub.setSelectedMedia(pub.selectedMedia.filter((m) => m !== id));
      } else {
        next.add(id);
        pub.setSelectedMedia([...pub.selectedMedia, id]);
      }
      return next;
    });
  }, [pub]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    pub.setSelectedMedia([]);
    pub.setSelectedAccounts([]);
    setUseAiIds(new Set());
  }, [pub]);

   /* FASE 14 — Fotocopiar: publicar en cuentas seleccionadas */
const copySelected = useCallback(async () => {
    const mediaIds = Array.from(selectedIds);
    const accountIds = pub.selectedAccounts;

    if (mediaIds.length === 0 || accountIds.length === 0) return;

    /* FASE 17 — Build use_ai_captions map for items with useAi=true */
    const useAiCaptions: Record<string, string> = {};
    for (const id of useAiIds) {
      const item = items.find((i) => i.id === id);
      if (item?.aiGeneratedCaption) {
        useAiCaptions[id] = item.aiGeneratedCaption;
      }
    }

    setPublishing(true);
    setShowProgressModal(true);

    try {
      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_ids: mediaIds,
          account_ids: accountIds,
          use_ai_captions: useAiCaptions,
        }),
      });
      const body = await res.json();

      if (res.ok && body.publication_id) {
        setPublicationId(body.publication_id);
        setPublicationTotal(body.jobs ?? 0);
        setPublicationJobs([]);
        /* El modal gestiona realtime + polling 2s */
      } else {
        setPublicationJobs([]);
        setPublishing(false);
      }
    } catch {
      setPublishing(false);
    }
  }, [items, selectedIds, pub.selectedAccounts, useAiIds]);

  /* FASE 14 — Reintentar jobs fallidos vía API */
  const retryFailedPublications = useCallback(async (failedIds: string[]) => {
    if (failedIds.length === 0) return;
    try {
      await fetch('/api/publications/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failed_ids: failedIds }),
      });
    } catch {
      /* el modal seguirá mostrando el estado actual */
    }
  }, []);

   /* FASE 16 — Open history publication in read-only modal */
  const openHistoryPublication = useCallback((pubId: string) => {
    setPublicationId(pubId);
    setShowProgressModal(true);
    /* The modal will fetch jobs via realtime/polling using publicationId */
  }, []);

  /* FASE 17 — Marca un item como "usar caption IA" localmente */
  const handleSetUseAi = useCallback((itemId: string, caption: string) => {
    setUseAiIds((prev) => new Set(prev).add(itemId));
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, useAi: true, aiGeneratedCaption: caption } : i
      )
    );
  }, []);

  /* FASE 17 — IA Masiva: batch genera captions para todos los seleccionados */
  const handleBulkAi = useCallback(async () => {
    const mediaIds = Array.from(selectedIds);
    if (mediaIds.length === 0) return;

    setBulkAiGenerating(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaItemIds: mediaIds,
          action: 'caption',
          platform: 'instagram',
          tone: 'viral',
        }),
      });
      const body = await res.json();

      if (res.ok && body.success && Array.isArray(body.results)) {
        const patchPromises = body.results
          .filter((r: { generated: string }) => r.generated)
          .map((r: { mediaId: string; generated: string }) =>
            fetch(`/api/media/${r.mediaId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ai_generated_caption: r.generated }),
            }).catch(() => null)
          );
        await Promise.allSettled(patchPromises);

        setItems((prev) =>
          prev.map((i) => {
            const result = body.results.find((r: { mediaId: string }) => r.mediaId === i.id);
            return result && result.generated
              ? { ...i, aiGeneratedCaption: result.generated }
              : i;
          })
        );
      }
    } catch {
      /* error silencioso; el usuario puede reintentar */
    } finally {
      setBulkAiGenerating(false);
    }
  }, [selectedIds]);

  const deleteItem = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/content/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setPreviewId(null);
      }
    } catch {
      // sin conexión: mantener el item
    }
  }, []);

  const clearFilters = useCallback(() => {
    setProviderTab('all');
    setTypeFilter('all');
    setSearchQuery('');
    setSortBy('recent');
  }, []);

  return (
    <main className="relative min-h-screen bg-background text-foreground pb-28">
      {/* Glow decorativo superior */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-50"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.22), transparent 60%)',
        }}
      />

      <div className="container relative mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand-purple/50 hover:text-foreground"
                aria-label="Volver al Dashboard"
              >
                <ArrowLeft size={15} />
              </Link>
              <h1 className="text-3xl font-bold">
                Contenido <span className="text-gradient">Library</span>
              </h1>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Sparkles size={12} className="text-brand-purple" />
              {items.length === 1 ? '1 elemento importado' : `${items.length} elementos importados`}
              {duplicateCount > 0 && ` · ${duplicateCount} duplicados`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {process.env.NEXT_PUBLIC_MOCK_MODE === 'true' && (
              <Badge
                variant="outline"
                className="border-yellow-500/60 bg-yellow-500/10 text-yellow-400"
              >
                MOCK_MODE ACTIVO
              </Badge>
            )}
            <button
              type="button"
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) void fetchHistory();
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200',
                showHistory
                  ? 'border-brand-purple/60 bg-brand-purple/15 text-foreground shadow-sm shadow-brand-purple/20'
                  : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
              )}
            >
              <History size={13} />
              Historial
              <span className="font-mono text-[10px] opacity-70">{historyCounts.total}</span>
            </button>
            <Button
              onClick={() => fetchData(true)}
              variant="outline"
              size="sm"
              disabled={loading || refreshing}
            >
              {refreshing ? <Spinner size={14} /> : <RefreshCw size={14} />}
              Actualizar
            </Button>
          </div>
        </motion.div>

        {/* FASE 16 — Historial de Publicaciones */}
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Historial de Publicaciones</h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>Total: <span className="font-mono text-foreground">{historyCounts.total}</span></span>
                <span className="text-red-400">Con fallos: <span className="font-mono">{historyCounts.failed}</span></span>
              </div>
            </div>
            {historyLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
                ))}
              </div>
            )}
            {!historyLoading && historyError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center text-sm text-destructive">
                <p>{historyError}</p>
                <Button onClick={fetchHistory} variant="outline" size="sm" className="mt-2">
                  Reintentar
                </Button>
              </div>
            )}
            {!historyLoading && !historyError && historyPublications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History size={44} className="mb-4 text-muted-foreground" />
                <p className="text-lg font-medium text-white">Sin historial de publicaciones</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Las publicaciones aparecerán aquí tras usar &quot;Fotocopiar Seleccionados&quot;.
                </p>
              </div>
            )}
            {!historyLoading && !historyError && historyPublications.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Procesados</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Exitosos</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Fallidos</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPublications.map((pub) => (
                      <tr
                        key={pub.id}
                        onClick={() => openHistoryPublication(pub.id)}
                        className={cn(
                          'border-b border-border/50 transition-colors cursor-pointer',
                          pub.failed_jobs > 0 ? 'hover:bg-red-500/5' : 'hover:bg-white/[0.02]'
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-white/70">
                          {new Date(pub.created_at).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                              pub.status === 'COMPLETED' || pub.status === 'SUCCESS'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : pub.failed_jobs > 0 && pub.succeeded_jobs > 0
                                ? 'bg-amber-500/20 text-amber-400'
                                : pub.failed_jobs > 0
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-violet-500/20 text-violet-400'
                            )}
                          >
                            {pub.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-white">{pub.total_jobs}</td>
                        <td className="px-4 py-3 font-mono text-emerald-400">{pub.succeeded_jobs}</td>
                        <td className="px-4 py-3 font-mono text-red-400">{pub.failed_jobs}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openHistoryPublication(pub.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <History size={12} />
                            Ver detalles
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* FASE 18 — Local Upload Dropzone */}
        <LocalUploadDropzone
          isDragOver={isDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
          uploading={localUploading}
          progress={localUploadProgress}
          fileInputRef={fileInputRef}
        />

        {/* Filtros */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <FilterBar
            providerTab={providerTab}
            onProviderChange={setProviderTab}
            providerCounts={providerCounts}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchInputRef={searchInputRef}
            duplicateCount={duplicateCount}
          />
        </motion.div>

        {/* Error */}
        {!loading && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center text-sm text-destructive"
          >
            <p>{error}</p>
            <Button onClick={() => fetchData()} variant="outline" size="sm" className="mt-2">
              Reintentar
            </Button>
          </motion.div>
        )}

        {/* Skeleton loading */}
        {loading && <SkeletonGrid />}

        {/* Empty state (sin nada importado) */}
        {!loading && !error && items.length === 0 && <EmptyState />}

        {/* Sin resultados con filtros */}
        {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
          <NoResults onClearFilters={clearFilters} />
        )}

        {/* Bento Grid */}
        {!loading && !error && filteredItems.length > 0 && (
          <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item, index) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  index={index}
                  selected={selectedIds.has(item.id)}
                  duplicate={duplicateIndex.get(item.id)}
                  onToggleSelect={toggleSelect}
                  onOpenPreview={setPreviewId}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Selection bar flotante */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <SelectionBar
            count={selectedIds.size}
            onDeselectAll={deselectAll}
            onCopySelected={copySelected}
            copying={publishing}
            accounts={accounts}
            selectedAccounts={pub.selectedAccounts}
            onToggleAccount={(id: string) => {
              if (pub.selectedAccounts.includes(id)) {
                pub.setSelectedAccounts(pub.selectedAccounts.filter((a) => a !== id));
              } else {
                pub.setSelectedAccounts([...pub.selectedAccounts, id]);
              }
            }}
            onBulkAi={handleBulkAi}
            bulkAiGenerating={bulkAiGenerating}
            aiSelectedCount={useAiIds.size}
          />
        )}
      </AnimatePresence>

      {/* FASE 14 — Publication Progress Modal */}
      <PublicationProgressModal
        isOpen={showProgressModal}
        publicationId={publicationId}
        jobs={publicationJobs}
        total={publicationTotal}
        onClose={() => {
          setShowProgressModal(false);
          setPublishing(false);
          setPublicationId(null);
        }}
        onRetryFailed={retryFailedPublications}
      />

      {/* Preview modal */}
      <AnimatePresence>
        {previewItem && (
           <PreviewModal
             item={previewItem}
             selected={selectedIds.has(previewItem.id)}
             duplicate={duplicateIndex.get(previewItem.id)}
             onClose={() => setPreviewId(null)}
             onDelete={deleteItem}
             onToggleSelect={toggleSelect}
             onSetUseAi={handleSetUseAi}
           />
        )}
      </AnimatePresence>
    </main>
  );
}
