import Sidebar from "@/app/components/Sidebar";

export const dynamic = "force-dynamic";

export default function TareasPage() {
  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-8 py-4 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
          <h1 className="text-lg font-semibold text-slate-900">Tareas</h1>
          <p className="text-xs text-slate-400 mt-0.5">ET Brands · gestión de pendientes</p>
        </div>

        <div className="px-8 py-16 max-w-2xl mx-auto">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 text-center space-y-2">
            <div className="text-4xl">🗂️</div>
            <p className="text-slate-900 text-base font-semibold">Próximamente</p>
            <p className="text-slate-500 text-sm">Esta sección está en construcción — la trabajamos después.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
