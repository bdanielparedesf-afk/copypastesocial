'use client';

/**
 * Layout compartido del dashboard — Shell futurista.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  HardDriveUpload,
  Home,
  LayoutGrid,
  Link2,
  Menu,
  Send,
  X,
} from 'lucide-react';
import UploadModal from '@/components/upload/upload-modal';
import { cn } from '@/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/content', label: 'Mi contenido', icon: LayoutGrid },
  { href: '/publications', label: 'Publicaciones', icon: Send },
  { href: '/accounts', label: 'Cuentas y Redes', icon: Link2 },
  { href: '/analytics', label: 'Analiticas', icon: BarChart3 },
] as const;

const PROVIDER_META = [
  { id: 'instagram', label: 'Instagram', dot: 'bg-gradient-to-br from-[#833AB4] to-[#F77737]' },
  { id: 'facebook', label: 'Facebook', dot: 'bg-[#1877F2]' },
  { id: 'tiktok', label: 'TikTok', dot: 'bg-gradient-to-br from-[#25F4EE] via-neutral-200 to-[#FE2C55]' },
  { id: 'youtube', label: 'YouTube', dot: 'bg-[#FF0000]' },
] as const;

interface AccountLite {
  id: string;
  provider: string;
  username: string;
  is_valid: boolean;
  token_is_valid?: boolean;
}
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((body: { accounts?: AccountLite[] }) => {
        if (!cancelled && Array.isArray(body.accounts)) setAccounts(body.accounts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const connectedProviders = new Set(
    accounts.filter((a) => a.is_valid !== false).map((a) => a.provider)
  );

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const providerStatus = (
    <div className="space-y-1.5">
      {PROVIDER_META.map((p) => {
        const connected = connectedProviders.has(p.id);
        return (
          <Link
            key={p.id}
            href="/accounts"
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5"
          >
            <span className={cn('h-2 w-2 rounded-full', connected ? cn(p.dot, 'shadow-glow-cyan') : 'bg-muted-foreground/30')} />
            <span className={cn(connected ? 'text-foreground' : 'text-muted-foreground')}>
              {p.label}
            </span>
            <span className={cn('ml-auto font-mono text-[10px]', connected ? 'text-emerald-400' : 'text-muted-foreground/50')}>
              {connected ? 'OK' : '—'}
            </span>
          </Link>
        );
      })}
    </div>
  );

  const desktopNav = (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
              active
                ? 'bg-gradient-to-r from-brand-purple/20 to-brand-cyan/10 text-white'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-brand-purple to-brand-cyan"
              />
            )}
            <Icon size={17} className={cn(active ? 'text-brand-purple' : 'group-hover:text-brand-cyan')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const mobileNav = (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium',
              active ? 'bg-white/10 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
            )}
          >
            <Icon size={17} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell relative min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="aurora-blob"
          style={{ width: 480, height: 480, top: '-160px', left: '-120px', background: 'radial-gradient(circle, rgba(124,58,237,0.35), transparent 65%)' }}
        />
        <div
          className="aurora-blob"
          style={{ width: 520, height: 520, top: '30%', right: '-180px', background: 'radial-gradient(circle, rgba(6,182,212,0.28), transparent 65%)' }}
        />
        <div className="grid-futuristic absolute inset-0 opacity-[0.05]" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-white/5 bg-ink-900/60 px-4 py-6 backdrop-blur-xl lg:flex">
          <div>
            <Link href="/" className="mb-8 flex items-center gap-2.5 px-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan text-xs font-black text-white shadow-glow-purple">
                CS
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-bold tracking-wide text-white">COPYPASTE</span>
                <span className="font-mono text-[10px] tracking-[0.3em] text-brand-cyan">SOCIAL</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan px-4 py-3 text-sm font-semibold text-white shadow-glow-purple transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <HardDriveUpload size={17} />
              Subir videos de tu PC
            </button>
            {desktopNav}
            <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Redes conectadas
              </p>
              {providerStatus}
            </div>
          </div>
          <p className="px-2 font-mono text-[10px] text-muted-foreground/50">
            v1.0 - IMPORTA - SELECCIONA - PUBLICA
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/5 bg-ink-900/70 px-4 backdrop-blur-xl lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              <Menu size={18} />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan text-[10px] font-black text-white">
                CS
              </span>
              <span className="text-sm font-bold tracking-wide text-white">COPYPASTE SOCIAL</span>
            </Link>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              aria-label="Subir videos desde tu PC"
              className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-purple to-brand-cyan px-3 text-xs font-semibold text-white shadow-glow-purple"
            >
              <HardDriveUpload size={14} />
              Subir
            </button>
          </header>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong flex h-full w-72 flex-col justify-between border-r border-white/10 p-5"
            >
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan text-[10px] font-black text-white">
                      CS
                    </span>
                    <span className="text-sm font-bold text-white">COPYPASTE SOCIAL</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Cerrar menu"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setUploadOpen(true);
                  }}
                  className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan px-4 py-3 text-sm font-semibold text-white shadow-glow-purple"
                >
                  <HardDriveUpload size={16} />
                  Subir videos de tu PC
                </button>
                {mobileNav}
                <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Redes conectadas
                  </p>
                  {providerStatus}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

