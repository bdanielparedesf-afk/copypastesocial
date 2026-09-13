'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Instagram,
  Link2,
  Loader2,
  Trash2,
  XCircle,
  Youtube,
} from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import { cn } from '@/utils';

interface SocialAccount {
  id: string;
  provider: string;
  username: string;
  is_valid: boolean;
  expires_at: string | null;
  created_at: string;
  token_is_valid: boolean;
  expiring_in_days: number | null;
  used_today?: number;
}

const PROVIDERS = [
  {
    id: 'instagram',
    label: 'Instagram',
    color: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
    icon: 'IG',
  },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', icon: 'FB' },
  { id: 'youtube', label: 'YouTube', color: 'bg-gradient-to-r from-[#FF0000] to-[#CC0000]', icon: 'YT' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-black', icon: 'TT' },
];

const DAILY_LIMIT = 25;

function getProviderInfo(providerId: string) {
  return (
    PROVIDERS.find((p) => p.id === providerId) ?? {
      id: providerId,
      label: providerId,
      color: 'bg-gray-500',
      icon: 'LK',
    }
  );
}

function ExpiresBadge({ account }: { account: SocialAccount }) {
  if (!account.expires_at) return null;
  const soon = account.expiring_in_days !== null && account.expiring_in_days <= 5;

  if (soon) {
    return (
      <Badge
        status="UNAVAILABLE"
        variant="status"
        className="border-red-500 bg-red-500/10 text-red-500"
      >
        <AlertTriangle size={12} />
        <span className="ml-1">Expira en {account.expiring_in_days}d</span>
      </Badge>
    );
  }

  return (
    <Badge status="ACCESSIBLE" variant="status" className="text-muted-foreground">
      Expira {new Date(account.expires_at).toLocaleDateString()}
    </Badge>
  );
}
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  async function fetchAccounts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts');
      const body = (await res.json()) as { accounts?: SocialAccount[]; error?: string };
      if (body.error) {
        setError(body.error);
      } else {
        setAccounts(body.accounts ?? []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar cuentas';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const handleSwitch = async (accountId: string) => {
    setSwitching(accountId);
    try {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (body.success) { setError(null); }
      else { setError(body.error ?? 'Error al cambiar de cuenta'); }
    } catch {
      setError('Error al cambiar de cuenta');
    } finally {
      setSwitching(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    setRevoking(accountId);
    try {
      const res = await fetch(`/api/accounts?account_id=${encodeURIComponent(accountId)}`, { method: 'DELETE' });
      if (res.ok) { await fetchAccounts(); }
      else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Error al desconectar cuenta');
      }
    } catch {
      setError('Error al desconectar cuenta');
    } finally {
      setRevoking(null);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAccounts();
  }, []);

  /* FASE 11: Connect Instagram */
  const handleConnectInstagram = async () => {
    setConnecting('instagram');
    try {
      const res = await fetch('/api/auth/instagram');
      const body = (await res.json()) as { url?: string; error?: string };
      if (body.url) {
        window.location.href = body.url;
      } else if (body.error) {
        setError(body.error);
        setConnecting(null);
      }
    } catch {
      setError('Error al iniciar la conexión de Instagram');
      setConnecting(null);
    }
  };

  /* FASE 12: Connect YouTube */
  const handleConnectYouTube = async () => {
    setConnecting('youtube');
    try {
      const res = await fetch('/api/auth/youtube');
      const body = (await res.json()) as { url?: string; error?: string };
      if (body.url) {
        window.location.href = body.url;
      } else if (body.error) {
        setError(body.error);
        setConnecting(null);
      }
    } catch {
      setError('Error al iniciar la conexión de YouTube');
      setConnecting(null);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="flex h-14 items-center px-6">
          <Link2 className="mr-2 h-5 w-5 text-primary" />
          <span className="font-semibold text-lg">Cuentas Conectadas</span>
          <span className="ml-auto text-xs text-muted-foreground">FASE 11</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <XCircle size={16} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        {accounts.length > 0 && (
          <Card className="mb-8 border-border/50">
            <CardContent className="flex flex-wrap items-center gap-6 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Cuentas activas:</span>
                <span className="text-sm text-muted-foreground">
                  {accounts.filter((a) => a.is_valid && a.token_is_valid).length} / {accounts.length}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent>
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Límite diario:</span>
                <span className="text-sm text-muted-foreground">25 publicaciones/día</span>
              </div>
            </CardContent>
          </Card>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Instagram className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No hay cuentas conectadas</h3>
                <p className="mt-1 text-sm text-muted-foreground">Conecta tu primera cuenta para comenzar a publicar.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleConnectInstagram} disabled={!!connecting}>
                  {connecting === 'instagram' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Conectando...</> : <><Instagram className="mr-2 h-4 w-4" />Connect Instagram</>}
                </Button>
                <Button onClick={handleConnectYouTube} disabled={!!connecting} variant="destructive" className="gap-2">
                  {connecting === 'youtube' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Conectando...</> : <><Youtube className="h-4 w-4" />Conectar YouTube</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => {
              const provider = getProviderInfo(account.provider);
              const usedToday = account.used_today ?? 0;
              const remaining = DAILY_LIMIT - usedToday;
              const isExpiring = account.expiring_in_days !== null && account.expiring_in_days <= 5;
              const isValid = account.is_valid && account.token_is_valid;
              return (
                <Card key={account.id} className={cn('border-border/50 transition-all hover:border-primary/30', !isValid && 'opacity-60')}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-md', provider.color)}>
                          {provider.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('truncate font-semibold', !isValid && 'text-muted-foreground line-through')}>{account.username}</span>
                            {isExpiring && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{provider.label}</span>
                            <span>·</span>
                            <span>{new Date(account.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <ExpiresBadge account={account} />
                        <Badge variant={isValid ? 'default' : 'destructive'} className={cn('text-xs', !isValid && 'bg-destructive/20 text-destructive')}>
                          {isValid ? 'Activo' : 'Desconectado'}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border/50 pt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Publicaciones hoy</span>
                        <span className="font-medium">{usedToday} / {DAILY_LIMIT}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full transition-all duration-300', remaining === 0 ? 'bg-destructive' : remaining <= 5 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(100, (usedToday / DAILY_LIMIT) * 100)}%` }} />
                      </div>
                      {remaining === 0 && <p className="mt-2 text-xs text-red-500">Límite diario alcanzado.</p>}
                      {remaining <= 5 && remaining > 0 && <p className="mt-2 text-xs text-amber-500">Quedan {remaining} publicación(es) hoy.</p>}
                    </div>
                    {isExpiring && (
                      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          <div>
                            <span className="font-medium">Token a expirar</span>
                            <p className="mt-0.5">Tu token expira en {account.expiring_in_days} días. <button onClick={() => handleConnectYouTube()} className="font-medium underline hover:no-underline">Reconecta ahora</button> para renovar.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      {isValid ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleSwitch(account.id)} disabled={!!switching}>
                            {switching === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><Link2 className="mr-2 h-3.5 w-3.5" />Establecer como activa</>}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDisconnect(account.id)} disabled={!!revoking}>
                            {revoking === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><Trash2 className="mr-2 h-3.5 w-3.5" />Desconectar</>}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => handleConnectYouTube()} disabled={!!connecting} className="w-full">
                          {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><Instagram className="mr-2 h-4 w-4" />Reconectar Instagram</>}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-8 flex justify-center gap-2">
          <Button size="lg" className="gap-2 shadow-lg shadow-primary/20" onClick={handleConnectInstagram} disabled={!!connecting}>
            <Instagram className="h-5 w-5" />
            {connecting ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : 'Connect Instagram'}
          </Button>
          <Button size="lg" variant="destructive" className="gap-2 shadow-lg shadow-primary/20" onClick={handleConnectYouTube} disabled={!!connecting}>
            <Youtube className="h-5 w-5" />
            {connecting ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : 'Conectar YouTube'}
          </Button>
        </div>
        <footer className="mt-12 flex flex-col items-center gap-2 border-t border-border/50 pt-8 text-xs text-muted-foreground">
          <p>FASE 11+12 — Multi-cuenta con límites</p>
          <ul className="flex flex-wrap items-center gap-4">
            <li>• Máx. 25 publicaciones/día por cuenta</li>
            <li>• Máx. 200 llamadas API/hora</li>
            <li>• Tokens con &lt;5 días: warning reconnect</li>
          </ul>
        </footer>
      </main>
    </div>
  );
}
