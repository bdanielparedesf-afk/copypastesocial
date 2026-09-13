'use client';

/**
 * FASE 19 — Página /analytics
 *
 * Métricas por plataforma con diseño #00A0A0B + glow violeta.
 * - 4 cards: IG / FB / YT / TT con % éxito
 * - Gráfico de barras: success vs failed últimos 7 días
 * - Tabla últimos 20 fallos
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  Instagram,
  Facebook,
  Youtube,
  LoaderCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PlatformStats {
  success: number;
  failed: number;
  pending: number;
  retrying: number;
  total: number;
}

interface DailyStat {
  date: string;
  success: number;
  failed: number;
}

interface RecentFailure {
  id: string;
  provider: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface AnalyticsResponse {
  platformStats: Record<string, PlatformStats>;
  dailyStats: DailyStat[];
  recentFailures: RecentFailure[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, color: '#1877F2' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, color: '#FF0000' },
  { key: 'tiktok', label: 'TikTok', icon: TrendingUp, color: '#00F2EA' },
] as const;

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
};

/* ------------------------------------------------------------------ */
/* Platform Card                                                       */
/* ------------------------------------------------------------------ */

function PlatformCard({
  platform,
  stats,
  index,
}: {
  platform: (typeof PLATFORMS)[number];
  stats: PlatformStats | undefined;
  index: number;
}) {
  const Icon = platform.icon;
  const total = stats?.total ?? 0;
  const success = stats?.success ?? 0;
  const failed = stats?.failed ?? 0;
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

  return (
    <motion.div
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      custom={index}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#151517] p-6"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-purple-500/10 to-transparent" />
      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${platform.color}20` }}
          >
            <Icon size={20} style={{ color: platform.color }} />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {platform.label}
          </span>
        </div>
        <div className="mb-2 text-4xl font-bold text-white">{successRate}%</div>
        <p className="mb-4 text-sm text-zinc-400">Tasa de éxito</p>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${successRate}%` }}
            transition={{ duration: 1, delay: 0.3 + index * 0.1, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-400"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold text-emerald-400">{success}</div>
            <div className="text-[10px] uppercase text-zinc-500">Exitos</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-red-400">{failed}</div>
            <div className="text-[10px] uppercase text-zinc-500">Fallos</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-zinc-300">{total}</div>
            <div className="text-[10px] uppercase text-zinc-500">Total</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Failures Table                                                      */
/* ------------------------------------------------------------------ */

function FailuresTable({ failures }: { failures: RecentFailure[] }) {
  if (failures.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
        No hay fallos registrados ✓
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Plataforma</th>
            <th className="px-4 py-3 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((f) => (
            <tr
              key={f.id}
              className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                {new Date(f.created_at).toLocaleString('es-CL', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium capitalize text-purple-300">
                  {f.provider}
                </span>
              </td>
              <td className="max-w-md truncate px-4 py-3 text-xs text-red-300/80">
                {f.error_message ?? 'Sin detalle'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Component                                                      */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/analytics/stats');
        if (!res.ok) throw new Error('Error cargando estadísticas');
        const json: AnalyticsResponse = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0B]">
        <LoaderCircle className="h-8 w-8 animate-spin text-purple-500" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0B]">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle size={16} />
          {error}
        </div>
      </main>
    );
  }

  const { platformStats = {}, dailyStats = [], recentFailures = [] } = data ?? {};

  return (
    <main className="min-h-screen bg-[#0A0A0B] px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-7xl"
      >
        <div className="mb-10">
          <h1 className="bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-3xl font-bold text-transparent">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Métricas de publicación por plataforma
          </p>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORMS.map((platform, i) => (
            <PlatformCard
              key={platform.key}
              platform={platform}
              stats={platformStats[platform.key]}
              index={i}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-10 rounded-2xl border border-white/[0.06] bg-[#151517] p-6"
        >
          <div className="mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Últimos 7 días</h2>
          </div>
          <div className="h-72 w-full">
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStats} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2E" />
                  <XAxis
                    dataKey="date"
                    stroke="#71717A"
                    fontSize={11}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis stroke="#71717A" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F1F22',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#A1A1AA' }} />
                  <Bar dataKey="success" name="Exitos" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Fallos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Sin datos para el período
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="rounded-2xl border border-white/[0.06] bg-[#151517] p-6"
        >
          <div className="mb-6 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-400" />
            <h2 className="text-lg font-semibold text-white">Últimos 20 fallos</h2>
          </div>
          <FailuresTable failures={recentFailures} />
        </motion.div>
      </motion.div>
    </main>
  );
}