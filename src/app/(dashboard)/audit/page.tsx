'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Command,
  Download,
  Gauge,
  Lock,
  LoaderCircle,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, Spinner } from '@/components/ui';
import { normalizeUrl } from '@/utils';
import { AUDIT_STATUS_LABELS, AuditStatus } from '@/types';
import type { AuditResult } from '@/types';
import { auditUrl } from '@/app/actions/audit';
import { downloadSource, getJobStatus } from '@/app/actions/download';

const statusIcons: Record<AuditStatus, React.ReactNode> = {
  CHECKING: <LoaderCircle className="animate-spin" size={22} />,
  ACCESSIBLE: <CheckCircle2 size={22} />,
  PRIVATE: <ShieldAlert size={22} />,
  UNAVAILABLE: <XCircle size={22} />,
  UNSUPPORTED: <Ban size={22} />,
  AUTH_REQUIRED: <Lock size={22} />,
  API_RESTRICTED: <Gauge size={22} />,
  ERROR: <AlertTriangle size={22} />,
};

const statusMessages: Record<AuditStatus, string> = {
  CHECKING: 'Comprobando acceso a la fuente...',
  ACCESSIBLE: '¡Fuente accesible y pública!',
  PRIVATE: 'El contenido es privado o requiere autenticación.',
  UNAVAILABLE: 'El contenido no está disponible.',
  UNSUPPORTED: 'Esta plataforma o formato no es compatible.',
  AUTH_REQUIRED: 'Se requiere autenticación para acceder.',
  API_RESTRICTED: 'La API tiene restricciones de cuota o acceso.',
  ERROR: 'Ocurrió un error inesperado durante la auditoría.',
};

function extractThumbnail(result: AuditResult): string | null {
  const { metadata } = result;
  if (metadata?.thumbnail && typeof metadata.thumbnail === 'string') {
    return metadata.thumbnail;
  }
  const oembed = metadata?.oembed;
  if (oembed && typeof oembed === 'object') {
    if (typeof (oembed as Record<string, unknown>).thumbnail === 'string') {
      return (oembed as Record<string, unknown>).thumbnail as string;
    }
  }
  const rawThumb = metadata?.thumbnail_url;
  if (typeof rawThumb === 'string') return rawThumb;
  return null;
}


export default function AuditPage() {
  const [rawUrl, setRawUrl] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  const handleAudit = async () => {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;

    setIsChecking(true);
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
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;

    setIsDownloading(true);
    setDownloadError(null);
    setJobId(null);
    setJobStatus(null);

    try {
      const response = await downloadSource(normalized);
      if (response.success && response.jobId) {
        setJobId(response.jobId);
        setJobStatus('pending');
      } else {
        setDownloadError(response.error ?? 'Error al iniciar descarga');
      }
    } catch {
      setDownloadError('Error al iniciar descarga');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const poll = setInterval(async () => {
      const status = await getJobStatus(jobId);
      if (status) {
        setJobStatus(status.status);
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(poll);
        }
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [jobId]);

  const statusColor = result ? `status-${result.status.toLowerCase()}` : '';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/10 text-brand-purple text-sm mb-4">
            <Sparkles size={14} />
            Auditoría de Fuente
          </div>
          <h1 className="text-4xl font-bold mb-3">
            Pega. <span className="text-gradient">Audita.</span> Publica.
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Pega la URL de contenido de Instagram, YouTube, Facebook o TikTok y
            verifica en tiempo real si es accesible, privado o requiere
            autenticación.
          </p>
                </motion.div>

        {/* Input bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card glass className="max-w-3xl mx-auto">
            <CardContent className="p-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAudit();
                }}
              >
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
                  disabled={!rawUrl.trim() || isChecking}
                >
                  {isChecking ? (
                    <Spinner size={16} />
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

        {/* Checking state */}
        {isChecking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto mt-6"
          >
            <Card glass>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Spinner size={28} />
                  <div className="flex-1">
                    <p className="font-medium">Comprobando acceso...</p>
                    <p className="text-sm text-muted-foreground">
                      Estamos verificando la fuente en tiempo real.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Result */}
        <AnimatePresence>
          {result && !isChecking && (
            <motion.div
              key={result.status}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto mt-6"
            >
              <Card glass>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={`mt-0.5 p-2 rounded-lg bg-${statusColor}/10`}
                    >
                      {statusIcons[result.status]}
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

                      <h3 className="text-lg font-semibold mb-1">
                        {result.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {result.message}
                      </p>

                      {result.status === AuditStatus.ACCESSIBLE &&
                      extractThumbnail(result) ? (
                        <div className="mt-3">
                          <img
                            src={extractThumbnail(result)!}
                            alt="Miniatura del contenido"
                            className="rounded-lg object-cover max-w-xs max-h-48 border border-border"
                          />
                        </div>
                      ) : null}

                      {result.status !== AuditStatus.ACCESSIBLE &&
                      result.status !== AuditStatus.CHECKING ? (
                        <p className="text-sm text-muted-foreground mt-2">
                          {statusMessages[result.status]}
                        </p>
                      ) : null}

                      {result.status === AuditStatus.ACCESSIBLE && (
                        <div className="mt-4 space-y-3">
                          <Button
                            onClick={handleDownload}
                            disabled={isDownloading || !!jobId}
                            variant="glow"
                            size="lg"
                            className="w-full"
                          >
                            {isDownloading ? (
                              <>
                                <Spinner size={16} />
                                Iniciando descarga...
                              </>
                            ) : jobId ? (
                              <>
                                <LoaderCircle className="animate-spin" size={16} />
                                Descargando...
                              </>
                            ) : (
                              <>
                                <Download size={16} />
                                Descargar
                              </>
                            )}
                          </Button>

                          {downloadError && (
                            <p className="text-sm text-destructive">{downloadError}</p>
                          )}

                          {jobId && jobStatus && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">Estado del job:</span>
                              <Badge
                                status={
                                  jobStatus === 'completed'
                                    ? 'ACCESSIBLE'
                                    : jobStatus === 'failed'
                                    ? 'UNAVAILABLE'
                                    : jobStatus === 'running'
                                    ? 'CHECKING'
                                    : 'CHECKING'
                                }
                                variant="status"
                              >
                                {jobStatus === 'pending' && 'En cola'}
                                {jobStatus === 'running' && 'Procesando'}
                                {jobStatus === 'completed' && 'Completado'}
                                {jobStatus === 'failed' && 'Fallido'}
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';