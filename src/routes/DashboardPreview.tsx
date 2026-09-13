'use client';

export default function DashboardPreview() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white p-6 md:p-8 font-sans selection:bg-[#7C3AED]/30">
      {/* HEADER */}
      <header className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center font-bold">C</div>
          <span className="font-semibold text-[17px]">Content Copier</span>
        </div>
        <nav className="hidden md:flex gap-8 text-[14px] text-zinc-400">
          <span className="text-white border-b-2 border-white pb-1">Dashboard</span>
          <span>Biblioteca</span>
          <span>Publicar</span>
          <span>Analytics</span>
          <span>Configuración</span>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-zinc-500">🔍</span>
          <span className="text-zinc-500">🔔</span>
          <div className="flex items-center gap-2 bg-[#151517] border border-[#262629] rounded-full px-3 py-1.5 text-sm">
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">EC</div>
            <span>Equipo</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1400px] mx-auto">
        {/* LEFT */}
        <div className="lg:col-span-8 space-y-6">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-zinc-400 mt-2">Bienvenido de nuevo. Aquí tienes un resumen de tu actividad.</p>
          </div>

          {/* CUENTAS CONECTADAS - PULCRO */}
          <div className="rounded-2xl bg-[#151517] border border-[#262629] p-7">
            <h2 className="font-semibold text-lg flex items-center gap-2">🔗 Cuentas Conectadas</h2>
            <p className="text-sm text-zinc-400 mt-1">Gestiona tus redes conectadas</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <AccountPill color="#FF0000" icon="▶" label="YouTube" />
              <AccountPill color="#E1306C" icon="◎" label="Instagram" />
              <AccountPill color="#1877F2" icon="f" label="Facebook" />
              <AccountPill color="#ffffff" icon="♪" label="TikTok" />
            </div>

            <p className="text-center text-xs text-zinc-500 mt-6">4 cuentas activas • última sincronización hace 12 min</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#151517] border border-[#262629] p-7">
              <p className="text-sm text-zinc-400 flex items-center gap-2">📚 Copias hoy</p>
              <p className="text-6xl font-bold mt-4">12</p>
              <p className="text-sm text-emerald-400 mt-2">+3 desde ayer</p>
            </div>
            <div className="rounded-2xl bg-[#151517] border border-[#262629] p-7">
              <p className="text-sm text-zinc-400 flex items-center gap-2">⏱ Ahorrado esta semana</p>
              <p className="text-5xl font-bold mt-4">8h 24m</p>
              <p className="text-sm text-zinc-500 mt-2">vs. 5h 10m semana anterior</p>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl bg-[#151517] border border-[#262629] p-6">
            <h3 className="font-semibold">Publicar como</h3>
            <p className="text-sm text-zinc-400 mt-1">Selecciona el perfil para publicar</p>
            <div className="mt-5 space-y-3">
              <ActiveProfile active label="Brand • Content Copier" initial="B" />
              <ActiveProfile label="Equipo • Diseñador" initial="D" />
              <ActiveProfile label="Equipo • Marketing" initial="M" />
            </div>
          </div>

          <div className="rounded-2xl bg-[#151517] border border-[#262629] p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold">Contenido Reciente</h3>
              <span className="text-zinc-500">☰</span>
            </div>
            <div className="space-y-4">
              <RecentItem file="post_IG_0924.mp4" meta="Instagram • Hace 2h" status="Listo" />
              <RecentItem file="blog_to_reel_0924.mp4" meta="TikTok • Hace 5h" status="Programado" />
              <RecentItem file="yt_short_0923.mp4" meta="YouTube • Ayer" status="Publicado" />
            </div>
            <button className="w-full mt-6 rounded-xl border border-zinc-700 py-3 text-sm hover:bg-white/5 transition">+ Nuevo contenido +</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountPill({ color, icon, label }: { color: string; icon: string; label: string }) {
  return (
    <div
      className="h-[54px] rounded-xl bg-[#0A0A0B] border flex items-center justify-center gap-2.5 text-[14px] font-medium hover:bg-white/[0.04] transition cursor-pointer"
      style={{ borderColor: `${color}40` }}
    >
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[13px]"
        style={{ backgroundColor: color, color: color === '#ffffff' ? 'black' : 'white' }}
      >
        {icon}
      </span>
      {label}
    </div>
  );
}

function ActiveProfile({ label, initial, active }: { label: string; initial: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${active ? 'border-[#5EEAD4]/50 bg-[#5EEAD4]/10' : 'border-[#262629] bg-[#0A0A0B]'}`}
    >
      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs">{initial}</div>
      <span className="flex-1">{label}</span>
      {active && <span className="text-[#5EEAD4]">ⓘ</span>}
    </div>
  );
}

function RecentItem({ file, meta, status }: { file: string; meta: string; status: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900" />
      <div className="flex-1">
        <p className="text-sm font-medium truncate">{file}</p>
        <p className="text-xs text-zinc-500">{meta} • {status}</p>
      </div>
      <span className="text-[11px] border border-zinc-700 rounded-full px-2.5 py-1 text-zinc-400">{status}</span>
    </div>
  );
}