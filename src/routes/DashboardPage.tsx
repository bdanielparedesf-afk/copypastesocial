'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardPaste,
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
import { normalizeUrl } from '@/utils';
import { detectSource } from '@/services/source-detector';
import { detectPlatform, isProfileUrl } from '@/lib/platform-detector';
import VideoPreview from '@/components/VideoPreview';
import ProfileImporter from '@/components/ProfileImporter';
import { AUDIT_STATUS_LABELS } from '@/types';
import { AuditStatus } from '@/types';
import type { AuditResult } from '@/types';
import type { SourceDetectionResult } from '@/types/source';
import type { SourceCheckResult } from '@/providers/interface';

function PlatformIcon({ provider }: { provider: string }) {
  if (provider === 'instagram') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#ig-gradient)" />
        <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
        <defs>
          <linearGradient id="ig-gradient" x1="0" y1="0" x2="24" y2="24">
            <stop stopColor="#833AB4" />
            <stop offset="0.5" stopColor="#E1306C" />
            <stop offset="1" stopColor="#F77737" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  if (provider === 'youtube') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#FF0000" />
        <polygon points="10,7 17,12 10,17" fill="white" />
      </svg>
    );
  }
  if (provider === 'facebook') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#1877F2" />
        <text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial">f</text>
      </svg>
    );
  }
  return <span className="text-xs text-muted-foreground">?</span>;
}

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

/**
 * FASE 6 — Panel de estado de accesibilidad de la fuente.
 * CHECKING (spinner violeta) → resultado animado con mensajes humanos.
 */
function SourceCheckPanel({ result }: { result: SourceCheckResult }) {
  const { accessibility, message, provider } = result;

  const tone: Record<string, string> = {
    ACCESSIBLE: 'status-accessible',
    PRIVATE: 'status-private',
    UNAVAILABLE: 'status-unavailable',
    UNSUPPORTED: 'status-unsupported',
    AUTH_REQUIRED: 'status-auth',
    API_RESTRICTED: 'status-api',
    ERROR: 'status-error',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className="mt-2"
    >
      <div className={`flex items-center gap-3 px-5 py-3 rounded-xl glass ${accessibility === 'ACCESSIBLE' ? 'glow-purple' : ''}`}>
        <div className={`p-1.5 rounded-lg ${tone[accessibility] ?? 'status-checking'} bg-opacity-10`}>
          {accessibility === 'ACCESSIBLE' && <CheckCircle2 size={18} />}
          {accessibility === 'PRIVATE' && <ShieldAlert size={18} />}
          {accessibility === 'AUTH_REQUIRED' && <Lock size={18} />}
          {accessibility === 'API_RESTRICTED' && <Gauge size={18} />}
          {accessibility === 'UNAVAILABLE' && <XCircle size={18} />}
          {accessibility === 'ERROR' && <AlertTriangle size={18} />}
        </div>
        <span className="text-sm flex-1 min-w-0">{message}</span>
        <Badge size="sm" className={`status-${accessibility.toLowerCase()} border border-current/20`}>
          {accessibility === 'ACCESSIBLE' && `${result.mediaCount} items`}
          {accessibility !== 'ACCESSIBLE' && provider.toUpperCase()}
        </Badge>
        {accessibility === 'AUTH_REQUIRED' && (
          <a href="/accounts">
            <Button size="sm">
              <Lock size={14} />
              Conectar Cuenta
            </Button>
          </a>
        )}
      </div>
    </motion.div>
  );
}

/** Estado CHECKING: spinner tech violeta con puntos animados. */
function SourceCheckingPanel({ provider }: { provider: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="mt-2"
    >
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl glass glow-purple">
        <LoaderCircle size={20} className="animate-spin text-brand-purple" />
        <span className="text-sm text-white">Verificando acceso en {provider}...</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-brand-purple inline-block"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * FASE 7 — Panel de importación: fuente ACCESSIBLE → botón
 * "Importar a la Librería" (POST /api/sources/import, dedup real).
 */
function SourceImportPanel({
  url,
  status,
  message,
  imported,
  onImport,
}: {
  url: string;
  status: 'idle' | 'importing' | 'done' | 'error';
  message: string | null;
  imported: boolean;
  onImport: (url: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="mt-2"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 rounded-xl glass">
        {status === 'importing' ? (
          <LoaderCircle size={18} className="animate-spin text-brand-purple" />
        ) : status === 'error' ? (
          <AlertTriangle size={18} className="text-destructive" />
        ) : imported ? (
          <CheckCircle2 size={18} className="text-brand-cyan" />
        ) : (
          <ClipboardPaste size={18} className="text-brand-purple" />
        )}

        {status === 'importing' && (
          <span className="text-sm text-white">Importando contenido a la librería...</span>
        )}
        {status !== 'importing' && message && (
          <span className="text-sm flex-1 min-w-0">{message}</span>
        )}
        {status !== 'importing' && !message && (
          <span className="text-sm flex-1 min-w-0">
            La fuente es pública: puedes importar su contenido a tu librería.
          </span>
        )}

        {!imported && status !== 'importing' && (
          <Button
            onClick={() => onImport(url)}
            disabled={status === 'error'}
            variant="glow"
            size="sm"
          >
            <ClipboardPaste size={13} />
            {status === 'error' ? 'Import no disponible' : 'Importar a la Librería'}
          </Button>
        )}

        {imported && (
          <Link
            href="/content"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-purple/15 px-3 py-1.5 text-xs font-medium text-brand-purple transition-colors hover:bg-brand-purple/25"
          >
            Ver en Contenido Library
            <ExternalLink size={12} />
          </Link>
        )}
      </div>
    </motion.div>
  );
}


export default function DashboardPage() {
  const [rawUrl, setRawUrl] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [detectedSource, setDetectedSource] = useState<SourceDetectionResult | null>(null);
  const [showDetection, setShowDetection] = useState(false);
  const [sourceCheck, setSourceCheck] = useState<SourceCheckResult | null>(null);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'done'>('idle');
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const checkSeqRef = useRef(0);

  /** FASE 6: CHECKING → POST /api/sources/check → resultado animado. */
  const runSourceCheck = async (url: string, providerName: SourceCheckResult['provider']) => {
    const seq = ++checkSeqRef.current;
    setCheckStatus('checking');
    setSourceCheck(null);
    try {
      const res = await fetch('/api/sources/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as Partial<SourceCheckResult> & { error?: string };
      if (seq !== checkSeqRef.current) return; // respuesta obsoleta
      if (res.ok && data.accessibility) {
        setSourceCheck(data as SourceCheckResult);
      } else {
        setSourceCheck({
          provider: providerName,
          url,
          contentType: 'profile',
          identifier: '',
          accessibility: 'ERROR',
          message: data.error ?? 'No se pudo verificar el acceso a la fuente.',
          mediaCount: 0,
        });
      }
    } catch {
      if (seq !== checkSeqRef.current) return;
      setSourceCheck({
        provider: providerName,
        url,
        contentType: 'profile',
        identifier: '',
        accessibility: 'ERROR',
        message: 'No se pudo verificar el acceso. Revisa tu conexión e intenta de nuevo.',
        mediaCount: 0,
      });
    } finally {
      if (seq === checkSeqRef.current) setCheckStatus('done');
    }
  };

  /** FASE 7: fuente ACCESSIBLE → POST /api/sources/import (con dedup real). */
  const runSourceImport = async (url: string) => {
    setImportStatus('importing');
    setImportMessage(null);
    try {
      const res = await fetch('/api/sources/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setImportStatus('done');
        setImported(true);
        setImportMessage(data.message ?? 'Contenido importado a la librería.');
      } else {
        setImportStatus('error');
        setImportMessage(data.error ?? data.message ?? 'No se pudo importar la fuente.');
      }
    } catch {
      setImportStatus('error');
      setImportMessage('No se pudo importar. Revisa tu conexión e intenta de nuevo.');
    }
  };

  const resetImport = () => {
    setImportStatus('idle');
    setImportMessage(null);
    setImported(false);
  };

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      resetImport();
      if (rawUrl.trim().length > 0) {
        const detection = detectSource(rawUrl);
        setDetectedSource(detection);
        setShowDetection(true);
        const platformResult = detectPlatform(rawUrl);
        if (platformResult.platform !== 'unknown') {
          void runSourceCheck(detection.url, detection.provider);
        } else {
          checkSeqRef.current += 1;
          setCheckStatus('idle');
          setSourceCheck(null);
        }
      } else {
        checkSeqRef.current += 1;
        setDetectedSource(null);
        setShowDetection(false);
        setCheckStatus('idle');
        setSourceCheck(null);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [rawUrl]);

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

  useEffect(() => {
    getPublications(10).then((res) => {
      if (res.success && res.publications) {
        setPublications(res.publications);
      }
    });
  }, []);

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
                <kbd className="hidden md:flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs text-muted-foreground">
                  <Command size={12} /> K
                </kbd>
                <Button
                  type="submit"
                  disabled={!rawUrl.trim() || isAnalyzing || detectPlatform(rawUrl).platform === 'unknown'}
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

        <AnimatePresence>
          {showDetection && detectedSource && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="max-w-3xl mx-auto mt-4"
            >
              {detectedSource.provider === 'instagram' && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl glass glow-purple">
                  <PlatformIcon provider="instagram" />
                  <span className="text-sm font-medium text-white">Instagram detectado</span>
                  <Badge variant="secondary" size="sm">{detectedSource.contentType}</Badge>
                </div>
              )}
              {detectedSource.provider === 'youtube' && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl glass glow-purple">
                  <PlatformIcon provider="youtube" />
                  <span className="text-sm font-medium text-white">YouTube detectado</span>
                  <Badge variant="secondary" size="sm">{detectedSource.contentType}</Badge>
                </div>
              )}
              {detectedSource.provider === 'facebook' && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl glass glow-purple">
                  <PlatformIcon provider="facebook" />
                  <span className="text-sm font-medium text-white">Facebook detectado</span>
                  <Badge variant="secondary" size="sm">{detectedSource.contentType}</Badge>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* UNIVERSAL: Video Preview + Profile Importer */}
        <AnimatePresence>
          {showDetection && detectedSource && detectPlatform(rawUrl).platform !== 'unknown' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="max-w-3xl mx-auto mt-4"
            >
              {isProfileUrl(rawUrl) ? (
                <ProfileImporter url={rawUrl} />
              ) : (
                <VideoPreview url={rawUrl} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* FASE 6 — Estado de accesibilidad: CHECKING → resultado animado */}
        <AnimatePresence>
          {showDetection && detectedSource && detectedSource.provider !== 'unsupported' && (
            <motion.div
              key={checkStatus === 'checking' ? 'source-checking' : `source-result-${sourceCheck?.accessibility ?? 'idle'}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="max-w-3xl mx-auto"
            >
              {checkStatus === 'checking' && <SourceCheckingPanel provider={detectedSource.provider} />}
              {checkStatus === 'done' && sourceCheck && <SourceCheckPanel result={sourceCheck} />}
              {sourceCheck?.accessibility === 'ACCESSIBLE' && (
                <SourceImportPanel
                  url={sourceCheck.url}
                  status={importStatus}
                  message={importMessage}
                  imported={imported}
                  onImport={runSourceImport}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

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