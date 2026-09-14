'use client';

/**
 * Inicio — Hub futurista CopyPasteSocial.
 * Hero + flujo en 3 pasos + subida de videos + estado de las 4 redes.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Facebook,
  HardDriveUpload,
  Instagram,
  LayoutGrid,
  Link2,
  Music2,
  Send,
  Unplug,
  Youtube,
} from 'lucide-react';
import UploadModal from '@/components/upload/upload-modal';
import { Button } from '@/components/ui';
import { cn } from '@/utils';

const NETWORKS = [
  { id: 'instagram', label: 'Instagram', chip: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', chip: 'bg-[#1877F2]', Icon: Facebook },
  { id: 'tiktok', label: 'TikTok', chip: 'bg-gradient-to-br from-[#25F4EE] via-neutral-200 to-[#FE2C55]', Icon: Music2 },
  { id: 'youtube', label: 'YouTube', chip: 'bg-[#FF0000]', Icon: Youtube },
] as const;

const STEPS = [
  { n: '01', title: 'Conecta tus 4 redes', desc: 'Instagram, Facebook, TikTok y YouTube con un clic cada una.', href: '/accounts', Icon: Link2 },
  { n: '02', title: 'Sube videos de tu PC', desc: 'Arrastra MP4, WEBM o MOV. Se encolan solos.', href: '/content', Icon: HardDriveUpload },
  { n: '03', title: 'Publica en todas a la vez', desc: 'Selecciona y lanza. Sigue el progreso en vivo.', href: '/publications', Icon: Send },
] as const;

interface AccountLite {
  id: string;
  provider: string;
  username: string;
  is_valid: boolean;
}

export default function Home() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [contentCount, setContentCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((b: { accounts?: AccountLite[] }) => {
        if (Array.isArray(b.accounts)) setAccounts(b.accounts);
      })
      .catch(() => undefined);
    fetch('/api/content')
      .then((r) => r.json())
      .then((b: { items?: unknown[] }) => {
        if (Array.isArray(b.items)) setContentCount(b.items.length);
      })
      .catch(() => undefined);
  }, []);

  const connected = new Set(
    accounts.filter((a) => a.is_valid !== false).map((a) => a.provider)
  );

  return (
    <main className="app-shell relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-blob" style={{ width: 560, height: 560, top: '-200px', left: '-140px', background: 'radial-gradient(circle, rgba(124,58,237,0.35), transparent 65%)' }} />
        <div className="aurora-blob" style={{ width: 600, height: 600, top: '20%', right: '-200px', background: 'radial-gradient(circle, rgba(6,182,212,0.28), transparent 65%)' }} />
        <div className="grid-futuristic absolute inset-0 opacity-[0.05]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan text-xs font-black text-white shadow-glow-purple">
              CS
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wide text-white">COPYPASTE</span>
              <span className="font-mono text-[10px] tracking-[0.3em] text-brand-cyan">SOCIAL</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/analytics" className="hidden items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground sm:flex">
              <BarChart3 size={14} /> Analiticas
            </Link>
            <Link href="/accounts" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              <Link2 size={14} /> {connected.size}/4 redes
            </Link>
            <Button variant="glow" size="sm" onClick={() => setUploadOpen(true)}>
              <HardDriveUpload size={14} /> Subir videos
            </Button>
          </div>
        </header>

        <section className="mt-12 text-center sm:mt-16">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[11px] uppercase tracking-[0.35em] text-brand-cyan">
            Importa - Selecciona - Publica
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mx-auto mt-3 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
            Tus videos de la PC a las <span className="text-gradient">4 redes</span> en minutos
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Conecta Instagram, Facebook, TikTok y YouTube una sola vez. Despues sube
            tus videos y publicalos en todas a la vez.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button variant="glow" size="xl" onClick={() => setUploadOpen(true)}>
              <HardDriveUpload size={18} /> Subir videos de mi PC
            </Button>
            <Link href="/accounts">
              <Button variant="outline" size="xl">
                Conectar mis redes <ArrowRight size={16} />
              </Button>
            </Link>
          </motion.div>
        </section>
        <section className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}>
              <Link href={s.href} className="glass group flex h-full flex-col gap-3 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand-purple/40 hover:shadow-glow-purple">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-glow-purple">
                    <s.Icon size={20} />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground/60">{s.n}</span>
                </div>
                <h2 className="font-bold text-white">{s.title}</h2>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
                <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-brand-cyan">
                  Ir ahora <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </motion.div>
          ))}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="glass rounded-2xl p-5 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-white">Estado de tus redes</h2>
              <Link href="/accounts" className="text-xs font-semibold text-brand-cyan hover:underline">
                Gestionar cuentas
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {NETWORKS.map((n) => {
                const ok = connected.has(n.id);
                return (
                  <Link key={n.id} href="/accounts" className={cn('flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all hover:-translate-y-0.5', ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02] hover:border-white/20')}>
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-white', n.chip)}>
                      <n.Icon size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{n.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {ok ? accounts.filter((a) => a.provider === n.id).map((a) => `@${a.username}`).join(', ') : 'Sin conectar — clic para iniciar sesion'}
                      </span>
                    </span>
                    {ok ? <BadgeCheck size={17} className="shrink-0 text-emerald-400" /> : <Unplug size={16} className="shrink-0 text-muted-foreground/50" />}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="glass neon-border relative overflow-hidden rounded-2xl p-5 lg:col-span-2">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 80% 10%, rgba(6,182,212,0.2), transparent 55%), radial-gradient(circle at 10% 90%, rgba(124,58,237,0.25), transparent 55%)' }} />
            <div className="relative flex h-full flex-col items-start justify-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-purple to-brand-cyan shadow-glow-purple">
                <LayoutGrid size={22} className="text-white" />
              </span>
              <h2 className="text-lg font-bold text-white">
                {contentCount === null ? 'Tu biblioteca te espera' : `${contentCount} video(s) en tu biblioteca`}
              </h2>
              <p className="text-sm text-muted-foreground">
                Sube desde tu PC o importa por URL, selecciona y publica en las redes conectadas.
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button variant="glow" onClick={() => setUploadOpen(true)}>
                  <HardDriveUpload size={15} /> Subir videos
                </Button>
                <Link href="/content">
                  <Button variant="outline">Ver contenido</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-col items-center gap-1 pb-6 text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground/50">COPYPASTESOCIAL — IMPORTA · SELECCIONA · PUBLICA</p>
        </footer>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </main>
  );
}

