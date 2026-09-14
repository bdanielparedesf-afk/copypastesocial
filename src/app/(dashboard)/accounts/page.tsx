'use client';

/**
 * Cuentas y Redes — Conecta Instagram, Facebook, TikTok y YouTube.
 *
 * - 4 tarjetas de red: estado, CTA "Iniciar sesion" y desconexion.
 * - Lista de cuentas reales conectadas via /api/accounts.
 * - Diseno futurista: aurora local, vidrio, bordes neon, animaciones.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  AtSign,
  BadgeCheck,
  CheckCircle2,
  Facebook,
  HardDriveUpload,
  Instagram,
  Link2,
  Loader2,
  Music2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Unplug,
  Youtube,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import UploadModal from '@/components/upload/upload-modal';
import { cn } from '@/utils';

type ProviderId = 'instagram' | 'facebook' | 'tiktok' | 'youtube';

interface SocialAccount {
  id: string;
  provider: string;
  username: string;
  profile_image?: string | null;
  is_valid: boolean;
  token_is_valid: boolean;
  expires_at: string | null;
  expiring_in_days: number | null;
  created_at: string;
}

const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  tagline: string;
  connectLabel: string;
  glow: string;
  chip: string;
  bar: string;
  Icon: typeof Instagram;
  init: () => Promise<Response>;
}> = [
  {
    id: 'instagram',
    label: 'Instagram',
    tagline: 'Reels y fotos desde tu PC o por URL',
    connectLabel: 'Iniciar sesion con Instagram',
    glow: 'hover:shadow-[0_0_36px_-8px_rgba(225,48,108,0.65)]',
    chip: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
    bar: 'from-[#833AB4] via-[#E1306C] to-[#F77737]',
    Icon: Instagram,
    init: () => fetch('/api/auth/instagram'),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    tagline: 'Publica videos en tu pagina o perfil',
    connectLabel: 'Iniciar sesion con Facebook',
    glow: 'hover:shadow-[0_0_36px_-8px_rgba(24,119,242,0.7)]',
    chip: 'bg-[#1877F2]',
    bar: 'from-[#1877F2] to-[#06B6D4]',
    Icon: Facebook,
    init: () => fetch('/api/auth/facebook'),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    tagline: 'Sube clips verticales en un clic',
    connectLabel: 'Iniciar sesion con TikTok',
    glow: 'hover:shadow-[0_0_36px_-8px_rgba(37,244,238,0.5)]',
    chip: 'bg-gradient-to-br from-[#25F4EE] via-neutral-200 to-[#FE2C55]',
    bar: 'from-[#25F4EE] to-[#FE2C55]',
    Icon: Music2,
    init: () => fetch('/api/auth/tiktok'),
  },
  {
    id: 'youtube',
    label: 'YouTube',
    tagline: 'Shorts y videos largos automaticos',
    connectLabel: 'Iniciar sesion con YouTube',
    glow: 'hover:shadow-[0_0_36px_-8px_rgba(255,0,0,0.6)]',
    chip: 'bg-[#FF0000]',
    bar: 'from-[#FF0000] to-[#F77737]',
    Icon: Youtube,
    init: () => fetch('/api/auth/youtube'),
  },
];

const STEP_LABELS = ['Conecta tus redes', 'Sube tus videos', 'Publica en 1 clic'];
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState<ProviderId | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchAccounts = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts', { cache: 'no-store' });
      const body = (await res.json()) as {
        accounts?: SocialAccount[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setAccounts(Array.isArray(body.accounts) ? body.accounts : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar cuentas';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Vuelta de OAuth (?connected= / ?error=) -> refrescar + aviso
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const oauthError = params.get('error');
    if (connected) {
      toast.success(`${connected} conectado correctamente`);
      fetchAccounts(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthError) {
      toast.error(`No se pudo conectar: ${oauthError}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchAccounts]);

  const connectedSet = useMemo(
    () => new Set(accounts.filter((a) => a.is_valid !== false).map((a) => a.provider)),
    [accounts]
  );

  const handleConnect = useCallback(async (providerId: ProviderId) => {
    if (connecting) return;
    setConnecting(providerId);
    try {
      const provider = PROVIDERS.find((p) => p.id === providerId);
      if (!provider) return;
      const res = await provider.init();
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? `No se pudo iniciar OAuth (${res.status})`);
      }
      window.location.href = body.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al conectar';
      toast.error(msg);
      setConnecting(null);
    }
  }, [connecting]);

  const handleDisconnect = useCallback(async (accountId: string) => {
    setDisconnecting(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) throw new Error(body.error ?? 'No se pudo desconectar');
      toast.success('Cuenta desconectada');
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al desconectar');
    } finally {
      setDisconnecting(null);
    }
  }, []);

  return (
    <main className="relative mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-cyan">
            Paso 1 de 3 - Cuentas
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Conecta tus <span className="text-gradient">4 redes sociales</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Inicia sesion en cada red una sola vez. Despues sube videos desde tu PC
            y publicalos en todas a la vez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
            <Zap size={12} className="text-brand-cyan" />
            {connectedSet.size}/4 conectadas
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAccounts(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Recargar
          </Button>
        </div>
      </header>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
              i === 0
                ? 'border-brand-purple/50 bg-brand-purple/10 text-white shadow-glow-purple'
                : 'border-white/5 bg-white/[0.02] text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold',
                i === 0
                  ? 'bg-gradient-to-br from-brand-purple to-brand-cyan text-white'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchAccounts()}
            className="ml-auto shrink-0 font-medium underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      <section
        aria-label="Redes sociales disponibles"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {PROVIDERS.map((provider, idx) => {
          const connected = connectedSet.has(provider.id);
          const list = accounts.filter((a) => a.provider === provider.id);
          const busy = connecting === provider.id;
          const { Icon } = provider;
          return (
            <motion.article
              key={provider.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07, duration: 0.45 }}
              className={cn(
                'glass group relative flex flex-col overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1',
                provider.glow,
                connected ? 'neon-border' : 'hover:border-white/20'
              )}
            >
              <div
                aria-hidden
                className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', provider.bar)}
              />
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg',
                    provider.chip
                  )}
                >
                  <Icon size={24} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-bold text-white">{provider.label}</h2>
                  <p className="truncate text-xs text-muted-foreground">{provider.tagline}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                {loading ? (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" /> Verificando...
                  </span>
                ) : connected ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                    <BadgeCheck size={13} /> Conectado{list.length > 1 ? ` (${list.length})` : ''}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    <Unplug size={13} /> Sin conectar
                  </span>
                )}
                {list.some((a) => a.expiring_in_days !== null && a.expiring_in_days <= 5) && (
                  <span className="text-[11px] text-amber-400">Token por vencer</span>
                )}
              </div>

              <div className="mt-4 flex-1 space-y-2">
                <AnimatePresence initial={false}>
                  {list.map((account) => (
                    <motion.div
                      key={account.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan text-[10px] font-bold text-white">
                        {account.username.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-foreground">
                        <AtSign size={11} className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{account.username}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(account.id)}
                        disabled={disconnecting === account.id}
                        aria-label={`Desconectar ${account.username}`}
                        title="Desconectar"
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                      >
                        {disconnecting === account.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!loading && list.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                    Aun no hay cuentas de {provider.label} aqui
                  </p>
                )}
              </div>

              <Button
                variant={connected ? 'outline' : 'glow'}
                className="mt-4 w-full"
                onClick={() => handleConnect(provider.id)}
                disabled={!!connecting || loading}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Abriendo {provider.label}...
                  </>
                ) : connected ? (
                  <>
                    <Link2 size={15} /> Conectar otra cuenta
                  </>
                ) : (
                  <>
                    <ShieldCheck size={15} /> {provider.connectLabel}
                  </>
                )}
              </Button>
            </motion.article>
          );
        })}
      </section>

      <section className="glass neon-border relative overflow-hidden rounded-2xl p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 85% 15%, rgba(6,182,212,0.22), transparent 55%), radial-gradient(circle at 10% 90%, rgba(124,58,237,0.25), transparent 55%)',
          }}
        />
        <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-purple to-brand-cyan shadow-glow-purple">
              <HardDriveUpload size={24} className="text-white" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                Ya conectaste {connectedSet.size} de 4 —{' '}
                <span className="text-gradient">sube tus videos ahora</span>
              </h2>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Elige MP4, WEBM o MOV desde tu PC. Se encolan solos para Instagram,
                YouTube, Facebook y TikTok.
              </p>
            </div>
          </div>
          <Button
            variant="glow"
            size="xl"
            onClick={() => setUploadOpen(true)}
            className="shrink-0"
          >
            <HardDriveUpload size={18} />
            Subir videos de mi PC
          </Button>
        </div>
      </section>

      {connectedSet.size > 0 && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <CheckCircle2 size={15} className="text-emerald-400" />
          Todo listo para publicar: ve a <span className="font-semibold text-foreground">Mi contenido</span> y
          lanza tus videos a las redes conectadas.
        </p>
      )}

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => fetchAccounts(true)} />
    </main>
  );
}

