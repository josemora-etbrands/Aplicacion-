import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TestDbPage() {
  let userCount: number | null = null;
  let error: string | null = null;

  try {
    userCount = await prisma.user.count();
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  const connected = error === null;

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">

        <div className={`rounded-2xl border p-8 text-center space-y-4 ${
          connected
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-red-500/30 bg-red-500/5"
        }`}>
          <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center text-3xl ${
            connected ? "bg-emerald-500/20" : "bg-red-500/20"
          }`}>
            {connected ? "✓" : "✗"}
          </div>

          <div>
            <h1 className="text-xl font-bold text-white">
              {connected ? "Conexión exitosa" : "Error de conexión"}
            </h1>
            <p className={`mt-1 text-sm ${connected ? "text-emerald-400" : "text-red-400"}`}>
              {connected ? "Supabase PostgreSQL · Pooler activo" : "Supabase no alcanzable"}
            </p>
          </div>

          {connected ? (
            <div className="rounded-xl bg-white/5 border border-white/10 px-6 py-4">
              <p className="text-sm text-slate-400">Usuarios en base de datos</p>
              <p className="text-4xl font-bold text-white mt-1">{userCount}</p>
            </div>
          ) : (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-left">
              <p className="text-xs font-mono text-red-300 break-all">{error}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600">
          /test-db — Solo para desarrollo. Eliminar antes de producción.
        </p>
      </div>
    </main>
  );
}
