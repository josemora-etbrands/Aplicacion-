export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">

        {/* Status badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-4 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-medium text-emerald-400">Stack inicializado correctamente</span>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight text-white">
            Mi Aplicación
          </h1>
          <p className="text-lg text-slate-400">
            Next.js · TypeScript · Tailwind CSS · Prisma · PostgreSQL
          </p>
        </div>

        {/* Stack cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          {[
            { label: "Next.js 15", desc: "App Router + TypeScript", color: "from-white/5 to-white/10", border: "border-white/10" },
            { label: "Tailwind CSS", desc: "Utility-first styling", color: "from-sky-500/10 to-sky-400/5", border: "border-sky-500/20" },
            { label: "Prisma ORM", desc: "PostgreSQL (Supabase)", color: "from-violet-500/10 to-violet-400/5", border: "border-violet-500/20" },
          ].map(({ label, desc, color, border }) => (
            <div
              key={label}
              className={`rounded-xl border ${border} bg-gradient-to-br ${color} p-5 text-left backdrop-blur-sm`}
            >
              <p className="font-semibold text-white">{label}</p>
              <p className="mt-1 text-sm text-slate-400">{desc}</p>
            </div>
          ))}
        </div>

        {/* Next steps */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-left space-y-2">
          <p className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Próximos pasos</p>
          <ol className="space-y-1 text-sm text-slate-400 list-decimal list-inside">
            <li>Conecta tu base de datos en <code className="text-violet-400">.env</code> → <code className="text-violet-400">DATABASE_URL</code></li>
            <li>Ejecuta <code className="text-sky-400">npx prisma migrate dev</code> para aplicar el schema</li>
            <li>Instala NextAuth.js o Clerk para autenticación</li>
            <li>Crea tus primeras rutas en <code className="text-sky-400">app/</code></li>
          </ol>
        </div>

      </div>
    </main>
  );
}
