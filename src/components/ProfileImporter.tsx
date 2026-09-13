'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  ClipboardCopy,
  LoaderCircle,
  RefreshCw,
  AlertTriangle,
  Play,
  ExternalLink,
  Image,
} from 'lucide-react';
import { detectPlatform, extractProfileUsername } from '@/lib/platform-detector';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import VideoPreview from '@/components/VideoPreview';

interface VideoItem {
  id: string;
  url: string;
  thumbnail: string | null;
  title: string;
  duration?: string;
  views?: string;
  /** URL directa del archivo MP4 (cuando la plataforma la expone). */
  directUrl?: string | null;
}

interface ProfileImporterProps {
  url: string;
}

function extractYouTubeId(videoUrl: string): string | null {
  // Formatos: /shorts/ID, /watch?v=ID, youtu.be/ID, /embed/ID
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = videoUrl.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getYouTubeThumbnail(videoUrl: string): string | null {
  const id = extractYouTubeId(videoUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

/**
 * Miniatura de cada video del perfil. Prioriza la imagen real del proveedor
 * (Instagram/Facebook/TikTok bloquean sus embeds en iframes, por eso es mejor
 * mostrar la miniatura). Si no hay miniatura o falla al cargar, cae al embed.
 */
function VideoThumb({ video, platform }: { video: VideoItem; platform: string }) {
  const [imgError, setImgError] = useState(false);
  const ytFallback = platform === 'youtube' ? getYouTubeThumbnail(video.url) : null;
  const src = video.thumbnail || ytFallback;

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={video.title}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  // Sin miniatura (o falló) → intentar embed de la plataforma.
  if (platform === 'instagram' || platform === 'tiktok' || platform === 'facebook') {
    return <VideoPreview url={video.url} compact />;
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-card">
      <Image size={24} className="text-muted-foreground/40" />
    </div>
  );
}

export default function ProfileImporter({ url }: ProfileImporterProps) {
  const platformResult = detectPlatform(url);
  const username = extractProfileUsername(url) ?? 'usuario';
  const platform = platformResult.platform;

  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setUsingFallback(false);
    setSelectedIds(new Set());
    try {
      const res = await fetch('/api/sources/profile-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform }),
      });
      const data = await res.json();
      if (res.ok && data.videos && data.videos.length > 0) {
        setVideos(data.videos);
      } else {
        setUsingFallback(true);
        setVideos([]);
      }
    } catch {
      setUsingFallback(true);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [url, platform, username]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map((v) => v.id)));
    }
  };

  const copySelected = async () => {
    const seleccionados = videos.filter((v) => selectedIds.has(v.id));
    if (seleccionados.length === 0) return;

    setImporting(true);

    let importedIds: string[] = [];
    try {
      // 1) Importar los videos seleccionados a la librería (dedup real).
      const res = await fetch('/api/sources/import-many', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: seleccionados.map((v) => ({ url: v.url, directUrl: v.directUrl ?? null })),
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const mediaItems = (data.imported ?? []).flatMap(
          (entry: { result?: { mediaItems?: Array<{ id?: string | null }> } }) =>
            entry.result?.mediaItems ?? []
        );
        importedIds = mediaItems
          .map((m: { id?: string | null }) => m.id)
          .filter((id: string | null | undefined): id is string => Boolean(id));

        if (importedIds.length > 0) {
          // 2) Preseleccionarlos en /content para subir a las 4 redes.
          localStorage.setItem('copypastesco_selected_media', JSON.stringify(importedIds));
        }

        const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
        if (failedCount > 0) {
          toast.warning(
            `${importedIds.length} importados, ${failedCount} no disponibles. Toca para ver detalle.`
          );
        } else {
          toast.success(`${importedIds.length} videos importados a la librería`);
        }
      } else {
        toast.error(data.error ?? 'No se pudieron importar los videos');
      }
    } catch {
      toast.error('Error al importar los videos. Intenta nuevamente.');
    }

    // Siempre guardar la cola de links en localStorage (útil como respaldo).
    localStorage.setItem('copypastesco_queue', JSON.stringify(seleccionados));
    localStorage.setItem('copypastesco_profile', username);

    setImporting(false);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      // La página de la librería tiene el selector de las 4 redes.
      window.location.href = '/content';
    }, 1000);
  };

  const label = platform === 'youtube' ? 'YouTube' : platform === 'instagram' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : platform === 'facebook' ? 'Facebook' : 'Plataforma';
  const color = platform === 'youtube' ? 'text-red-500' : platform === 'instagram' ? 'text-pink-500' : platform === 'tiktok' ? 'text-white' : platform === 'facebook' ? 'text-blue-500' : 'text-muted-foreground';

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto mt-6">
        <Card glass>
          <CardContent className="p-6 flex flex-col items-center gap-4">
            <LoaderCircle size={32} className="animate-spin text-brand-purple" />
            <div className="text-center">
              <p className="font-medium">Perfil detectado: @{username}</p>
              <p className="text-sm text-muted-foreground mt-1">Buscando videos de {label}...</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto mt-6">
      <Card glass>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Play size={20} className={color} />
              <div>
                <p className="font-medium">Perfil: <span className={color}>@{username}</span></p>
                <p className="text-xs text-muted-foreground">{label} · {videos.length} videos</p>
              </div>
            </div>
            <button onClick={fetchVideos} className="p-2 rounded-lg hover:bg-muted transition"><RefreshCw size={16} className="text-muted-foreground" /></button>
          </div>
          <AnimatePresence>
            {usingFallback && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-amber-200 font-medium">
                      {platform === 'facebook' ? 'Facebook bloquea el escaneo desde servidor' : 'No se pudieron obtener los videos del perfil'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {platform === 'facebook' ? 'Pega links individuales de videos en el campo superior para analizarlos.' : 'Intenta nuevamente o pega links individuales.'}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {videos.length > 0 && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAll} className="flex items-center gap-2">
                <CheckCheck size={14} />
                {selectedIds.size === videos.length ? 'Deseleccionar' : 'Seleccionar todos'}
              </Button>
              <Badge variant="secondary" size="sm">{selectedIds.size}/{videos.length}</Badge>
              <div className="flex-1" />
              <Button size="sm" onClick={copySelected} disabled={selectedIds.size === 0 || importing} className={`flex items-center gap-2 transition-colors ${importing ? 'bg-brand-purple text-white border-brand-purple' : copied ? 'bg-green-500 hover:bg-green-600 text-white border-green-500' : ''}`}>
                {importing ? <><LoaderCircle size={14} className="animate-spin" />Importando {selectedIds.size}...</> : copied ? <><Check size={14} />¡Listo! ✓</> : <><ClipboardCopy size={14} />Fotocopiar{selectedIds.size > 0 ? ` ${selectedIds.size}` : ''}</>}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
            {videos.map((video) => {
              const isSelected = selectedIds.has(video.id);
              return (
                <motion.div key={video.id} layout whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => toggleSelect(video.id)}
                  className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-brand-purple ring-2 ring-brand-purple/30' : 'border-border hover:border-muted-foreground/50'}`}
                >
                  <div className="aspect-video bg-muted relative">
                    <VideoThumb video={video} platform={platform} />
                    {video.duration && <span className="absolute bottom-1 right-1 text-[10px] bg-black/80 text-white px-1 rounded">{video.duration}</span>}
                    {isSelected && <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-brand-purple flex items-center justify-center"><Check size={12} className="text-white" /></div>}
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition flex items-center justify-center opacity-0 hover:opacity-100">
                      <Play size={24} className="text-white drop-shadow-lg" />
                    </div>
                  </div>
                  <div className="p-2 bg-card/80">
                    <p className="text-xs truncate">{video.title}</p>
                    {video.views && <p className="text-[10px] text-muted-foreground">{video.views} vistas</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition">
              <ExternalLink size={12} />Abrir en {label}
            </a>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="default" onClick={copySelected} disabled={importing}>
                {importing ? (
                  <LoaderCircle size={14} className="animate-spin mr-2" />
                ) : (
                  <ClipboardCopy size={14} className="mr-2" />
                )}
                {importing ? 'Importando...' : `Importar ${selectedIds.size} a librería`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}