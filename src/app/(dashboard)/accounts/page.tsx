'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Link2,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Spinner } from '@/components/ui';

interface SocialAccount {
  id: string;
  provider: string;
  username: string;
  is_valid: boolean;
  expires_at: string | null;
  created_at: string;
}

const PROVIDERS = [
  { id: 'instagram', label: 'Instagram', color: 'bg-pink-500', icon: 'IG' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', icon: 'FB' },
  { id: 'youtube', label: 'YouTube', color: 'bg-red-600', icon: 'YT' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-black', icon: 'TT' },
];

function getProviderInfo(providerId: string) {
  return PROVIDERS.find((p) => p.id === providerId) ?? { id: providerId, label: providerId, color: 'bg-gray-500', icon: 'LK' };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

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

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const res = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
        setConnecting(null);
      }
    } catch {
      setError('Error al iniciar conexi\u00F3n');
      setConnecting(null);
    }
  };

  const handleRevoke = async (accountId: string) => {
    setRevoking(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/revoke`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchAccounts();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Error al revocar cuenta');
      }
    } catch {
      setError('Error al revocar cuenta');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Link2 size={28} />
            Cuentas Sociales
          </h1>
          <p className="text-muted-foreground">
            Conecta tus cuentas para publicar contenido directamente.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        <Card glass className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Conectar nueva cuenta</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PROVIDERS.map((provider) => (
                <Button
                  key={provider.id}
                  onClick={() => handleConnect(provider.id)}
                  disabled={connecting === provider.id}
                  variant="outline"
                  className="flex-col h-auto py-4 gap-2"
                >
                  {connecting === provider.id ? (
                    <Spinner size={20} />
                  ) : (
                    <span className="text-2xl">{provider.icon}</span>
                  )}
                  <span className="text-sm">{provider.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4">Cuentas conectadas</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size={32} />
            </div>
          ) : accounts.length === 0 ? (
            <Card glass>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>No hay cuentas conectadas a&uacute;n.</p>
                <p className="text-sm mt-1">
                  Usa los botones de arriba para conectar tus redes sociales.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {accounts.map((account, index) => {
                  const providerInfo = getProviderInfo(account.provider);
                  return (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card glass>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <span className="text-2xl">{providerInfo.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{account.username}</span>
                                <Badge
                                  status={account.is_valid ? 'ACCESSIBLE' : 'UNAVAILABLE'}
                                  variant="status"
                                >
                                  {account.is_valid ? (
                                    <>
                                      <CheckCircle2 size={12} />
                                      Activa
                                    </>
                                  ) : (
                                    <>
                                      <XCircle size={12} />
                                      Expirada
                                    </>
                                  )}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {providerInfo.label} &middot; Conectada{' '}
                                {new Date(account.created_at).toLocaleDateString()}
                                {account.expires_at && ` &middot; Expira ${new Date(account.expires_at).toLocaleDateString()}`}
                              </p>
                            </div>
                            <Button
                              onClick={() => handleRevoke(account.id)}
                              disabled={revoking === account.id}
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                            >
                              {revoking === account.id ? (
                                <Spinner size={14} />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </main>
  );
}

export const dynamic = 'force-dynamic';
