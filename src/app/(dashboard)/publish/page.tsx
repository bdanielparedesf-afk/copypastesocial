'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, LoaderCircle, Send, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@/components/ui';
import { createPublication } from '@/app/actions/publish';
import { getJobStatus } from '@/app/actions/download';

interface SourceMedia {
  id: string;
  url: string;
  thumbnail_url: string | null;
  type: string;
  metadata: Record<string, unknown> | null;
}

interface SourceRow {
  id: string;
  original_url: string;
  provider: string;
  status: string;
  media_items: SourceMedia[];
}

interface SocialAccount {
  id: string;
  provider: string;
  username: string;
  is_valid: boolean;
}

interface JobView {
  status: string;
  error: string | null;
}

const JOB_BADGES: Record<string, { label: string; status: string }> = {
  pending: { label: 'Pendiente', status: 'CHECKING' },
  running: { label: 'Procesando', status: 'CHECKING' },
  completed: { label: 'Completado', status: 'ACCESSIBLE' },
  failed: { label: 'Fallido', status: 'UNAVAILABLE' },
};

export default function PublishPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/sources')
        .then((r) => r.json())
        .catch(() => ({ sources: [] })),
      fetch('/api/accounts')
        .then((r) => r.json())
        .catch(() => ({ accounts: [] })),
    ]).then(([sourceData, accountData]) => {
      setSources((sourceData as { sources?: SourceRow[] }).sources ?? []);
      setAccounts((accountData as { accounts?: SocialAccount[] }).accounts ?? []);
    });
  }, []);

  const readySources = sources.filter((s) => s.media_items && s.media_items.length > 0);

  const handlePublish = async () => {
    if (!selectedSource || !selectedAccount) {
      setError('Selecciona una fuente y una cuenta social');
      return;
    }

    setIsPublishing(true);
    setError(null);
    setJob(null);

    const response = await createPublication({
      sourceId: selectedSource,
      socialAccountId: selectedAccount,
      caption,
    });

    if (!response.success || !response.jobId) {
      setError(response.error ?? 'Error al publicar');
      setIsPublishing(false);
      return;
    }

    const startedAt = Date.now();
    const jobId = response.jobId;

    const poll = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        if (!status) {
          clearInterval(poll);
          setIsPublishing(false);
          return;
        }
        if (status.status === 'completed' || status.status === 'failed') {
          setJob({ status: status.status, error: status.error });
          clearInterval(poll);
          setIsPublishing(false);
          return;
        }
        setJob({ status: status.status, error: status.error });
      } catch {
        // reintentar en el siguiente ciclo
      }
      if (Date.now() - startedAt > 120000) {
        clearInterval(poll);
        setIsPublishing(false);
      }
    }, 2000);
  };
return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Publicar Contenido</h1>
        <p className="text-muted-foreground">
          Selecciona una fuente descargada, elige la cuenta social y escribe tu pie de foto.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card glass>
          <CardHeader>
            <CardTitle>Nueva Publicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Fuente (video transcodificado)</label>
              {readySources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay fuentes con contenido descargado. Audita una URL y descárgala primero en la
                  página principal.
                </p>
              ) : (
                <div className="grid gap-2">
                  {readySources.map((source) => {
                    const thumb = source.media_items[0]?.thumbnail_url;
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => setSelectedSource(source.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                          selectedSource === source.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                            <span className="text-muted-foreground text-xs capitalize">{source.provider}</span>
                          </div>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{source.original_url}</span>
                          <span className="block text-xs text-muted-foreground capitalize">{source.provider}</span>
                        </span>
                        {selectedSource === source.id && <CheckCircle2 size={18} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Cuenta social</label>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes cuentas conectadas.{' '}
                  <a href="/accounts" className="text-primary underline">Conectar cuenta</a>
                </p>
              ) : (
                <div className="grid gap-2">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setSelectedAccount(account.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                        selectedAccount === account.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium">@{account.username}</span>
                        <span className="block text-xs text-muted-foreground capitalize">{account.provider}</span>
                      </span>
                      <Badge
                        status={account.is_valid ? 'ACCESSIBLE' : 'UNAVAILABLE'}
                        variant="status"
                        size="sm"
                      >
                        {account.is_valid ? 'Activa' : 'Expirada'}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
<div>
              <label className="text-sm font-medium mb-2 block">Pie de foto</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Escribe un pie de foto..."
                className="w-full px-4 py-3 rounded-xl border border-border bg-background/50 backdrop-blur-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
              />
            </div>

            <Button
              onClick={handlePublish}
              disabled={isPublishing || !selectedSource || !selectedAccount}
              variant="glow"
              size="lg"
              className="w-full"
            >
              {isPublishing ? (
                <>
                  <Spinner size={16} />
                  Publicando...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Publicar
                </>
              )}
            </Button>

            {job && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {job.status === 'running' || job.status === 'pending' ? (
                  <LoaderCircle size={18} className="animate-spin text-primary" />
                ) : job.status === 'completed' ? (
                  <CheckCircle2 size={18} className="text-green-500" />
                ) : (
                  <XCircle size={18} className="text-destructive" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Job de publicación</p>
                  {job.error && <p className="text-xs text-destructive truncate">{job.error}</p>}
                </div>
                <Badge
                  status={JOB_BADGES[job.status]?.status ?? 'CHECKING'}
                  variant="status"
                  size="sm"
                >
                  {JOB_BADGES[job.status]?.label ?? job.status}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}