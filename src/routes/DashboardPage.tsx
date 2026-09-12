'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Command,
  Gauge,
  Lock,
  LoaderCircle,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, Spinner } from '@/components/ui';
import { auditUrl } from '@/app/actions/audit';
import { getPublications } from '@/app/actions/publish';
import { getProviderForUrl } from '@/providers/registry';
import { normalizeUrl } from '@/utils';
import { AUDIT_STATUS_LABELS } from '@/types';
import { AuditStatus } from '@/types';
import type { AuditResult } from '@/types';

const statusConfig: Record<AuditStatus, { icon: React.ReactNode; color: string }> = {
  CHECKING: { icon: <LoaderCircle className="animate-spin" size={22} />, color: 'status-checking' },
  ACCESSIBLE: { icon: <CheckCircle2 size={22} />, color: 'status-accessible' },
  PRIVATE: { icon: <ShieldAlert size={22} />, color: 'status-private' },
  UNAVAILABLE: { icon: <XCircle size={22} />, color: 'status-unavailable' },
  UNSUPPORTED: { icon: <Ban size={22} />, color: 'status-unsupported' },
  AUTH_REQUIRED: { icon: <Lock size={22} />, color: 'status-auth' },
  API_RESTRICTED: { icon: <Gauge size={22} />, color: 'status-api' },
  ERROR: { icon: <AlertTriangle size={22} />, color: 'status-error' },
};

interface Publication {
  id: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  source: { originalUrl: string; provider: string } | null;
  socialAccount: { provider: string; username: string } | null;
  mediaItems: Array<{ url: string; thumbnailUrl: string | null; type: string }>;
}

const publicationStatusBadge: Record<string, { label: string; status: AuditStatus }> = {
  pending: { label: 'Pendiente', status: AuditStatus.CHECKING },
  processing: { label: 'Procesando', status: AuditStatus.CHECKING },
  published: { label: 'Publicado', status: AuditStatus.ACCESSIBLE },
  failed: { label: 'Fallido', status: AuditStatus.UNAVAILABLE },
};

export default function DashboardPage() {
  const [rawUrl, setRawUrl] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [publications, setPublications] = useState<Publication[]>([]);

  const provider = getProviderForUrl(rawUrl);

  useEffect(() => {
    getPublications(10).then((res) => {
      if (res.success && res.publications) {
        setPublications(res.publications);
      }
    });
  }, []);

  const handleAnalyze = async () => {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;
    setIsAnalyzing(true);
    setResult(null);
    try {
      const response = await auditUrl(normalized);
      if (response.success && response.data) {
        setResult(response.data);
      } else {
        setResult({
          id: crypto.randomUUID(),
          sourceUrl: normalized,
          provider: 'instagram',
          status: 'ERROR' as AuditStatus,
          title: 'Error',
          message: response.error ?? 'Error desconocido',
          metadata: {},
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      setResult({
        id: crypto.randomUUID(),
        sourceUrl: normalized,
        provider: 'instagram',
        status: 'ERROR' as AuditStatus,
        title: 'Error',
        message: 'No se pudo completar la auditoría.',
        metadata: {},
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/10 text-brand-purple text-sm mb-6">
            <Sparkles size={14} />
            Flujo 01 / 05
          </div>
          <h1 className="text-5xl font-bold mb-4">
            Pega. <span className="text-gradient">Selecciona.</span> Publica.
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Importa contenido social, elige lo importante y publícalo en tus destinos sin perder el control.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card glass className="max-w-3xl mx-auto">
            <CardContent className="p-2">
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); handleAnalyze(); }}>
                <Search size={20} className="text-muted-foreground ml-2" aria-hidden="true" />
                <Input
                  value={rawUrl}
                  onChange={(e) => setRawUrl(e.target.value)}
                  placeholder="PEGAR URL DEL PERFIL O CONTENIDO"
                  className="border-0 bg-transparent focus-visible:ring-0 text-base"
                  inputMode="url"
                />
                {provider && (
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm text-muted-foreground">{provider.label}</span>
                  </div>
                )}
                <kbd className="hidden md:flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs text-muted-foreground">
                  <Command size={12} /> K
                </kbd>
                                <Button
                  type="submit"
                  disabled={!rawUrl.trim() || isAnalyzing}
                >
                  {isAnalyzing ? (
                    <>
                      <Spinner size={16} />
                      Auditar...
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      Auditar
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

                {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto mt-6"
          >
            <Card glass>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`mt-0.5 p-2 rounded-lg bg-${statusConfig[result.status].color}/10`}
                  >
                    {statusConfig[result.status].icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge status={result.status} variant="status">
                        {AUDIT_STATUS_LABELS[result.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {result.provider.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold mb-1">{result.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {result.message}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {publications.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-4xl mx-auto mt-12"
          >
            <h2 className="text-lg font-semibold mb-4">Últimas Publicaciones</h2>
            <div className="grid gap-3">
              {publications.map((pub) => {
                const badgeInfo = publicationStatusBadge[pub.status] ?? {
                  label: pub.status,
                  status: AuditStatus.ERROR,
                };
                const thumbnail = pub.mediaItems[0]?.thumbnailUrl ?? null;
                return (
                  <Card key={pub.id} glass>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt="Thumbnail"
                            className="w-16 h-16 rounded-lg object-cover border border-border"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                            <ExternalLink size={20} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge status={badgeInfo.status} variant="status" size="sm">
                              {badgeInfo.label}
                            </Badge>
                            {pub.socialAccount && (
                              <span className="text-xs text-muted-foreground">
                                {pub.socialAccount.provider} · @{pub.socialAccount.username}
                              </span>
                            )}
                          </div>
                          <p className="text-sm truncate">
                            {pub.caption || 'Sin descripción'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(pub.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}