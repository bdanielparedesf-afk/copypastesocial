'use client';

import { useState } from 'react';
import { AlertTriangle, Film } from 'lucide-react';
import { getEmbedUrl, detectPlatform } from '@/lib/platform-detector';

interface VideoPreviewProps {
  url: string;
  className?: string;
  compact?: boolean;
}

export default function VideoPreview({ url, className = '', compact = false }: VideoPreviewProps) {
  const [hasError, setHasError] = useState(false);
  const platform = detectPlatform(url);
  const embedUrl = getEmbedUrl(url);

  // If we can't generate an embed URL, show fallback message
  if (!embedUrl) {
    return (
      <div className={`rounded-xl border border-border bg-card/50 p-8 text-center ${className}`}>
        <Film size={48} className="mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-muted-foreground font-medium mb-1">Vista previa no disponible</p>
        <p className="text-sm text-muted-foreground/70">
          Pega un link de video de YouTube, Instagram, TikTok o Facebook para ver la vista previa.
        </p>
      </div>
    );
  }

  // If iframe failed to load (user can report error), show fallback
  if (hasError) {
    return (
      <div className={`rounded-xl border border-border bg-card/50 p-8 text-center ${className}`}>
        <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500/70" />
        <p className="text-foreground font-medium mb-1">
          El video no se pudo incrustar, pero puedes continuar con análisis manual
        </p>
        <p className="text-sm text-muted-foreground">
          Algunos videos tienen restricciones de incrustación. El video original sigue disponible en su plataforma.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-80 transition"
        >
          Abrir video original ↗
        </a>
      </div>
    );
  }

  // Determine aspect ratio based on platform
  const isVertical =
    platform.platform === 'tiktok' ||
    (platform.platform === 'instagram' && url.includes('/reel')) ||
    (platform.platform === 'youtube' && url.includes('/shorts/'));

  // Compact mode for grid cards en ProfileImporter
  if (compact) {
    return (
      <div className={`absolute inset-0 w-full h-full bg-black ${className}`}>
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          frameBorder="0"
          title="Video preview"
          onError={() => setHasError(true)}
        />
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-card">
            <AlertTriangle size={20} className="text-amber-500/70" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border border-border bg-black ${className}`}>
      <div
        className={`relative w-full ${isVertical ? 'aspect-[9/16] max-h-[600px]' : 'aspect-video'}`}
      >
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          frameBorder="0"
          title="Video preview"
          onError={() => setHasError(true)}
        />
      </div>
      {/* Error fallback button in case iframe silently fails */}
      <div className="flex items-center justify-between px-4 py-2 bg-card/80 border-t border-border">
        <span className="text-xs text-muted-foreground truncate max-w-[70%]">{url}</span>
        <button
          onClick={() => setHasError(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition"
        >
          ¿No carga? Abrir original
        </button>
      </div>
    </div>
  );
}