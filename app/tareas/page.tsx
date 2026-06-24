import Sidebar from "@/app/components/Sidebar";
import TareasList from "@/app/components/TareasList";

export default function TareasPage() {
  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-8 py-4 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
          <h1 className="text-lg font-semibold text-slate-900">Tareas</h1>
          <p className="text-xs text-slate-400 mt-0.5">Palancas registradas por aplicar · agrupadas por acción</p>
        </div>
        <div className="px-8 py-6 max-w-3xl mx-auto">
          <TareasList />
        </div>
      </main>
    </div>
  );
}
