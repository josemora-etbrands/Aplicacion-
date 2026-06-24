"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";

const nav = [
  { href: "/",          icon: "⚡", label: "Velocidad de Ventas" },
  { href: "/importar",  icon: "⟳", label: "Datos / Sync"        },
  { href: "/tareas",    icon: "✓", label: "Tareas"              },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100">
        <Logo className="w-28 h-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}>
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-1">
        <div className="flex items-center gap-2 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-400">Agente IA activo</span>
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
          <span className="text-base">⎋</span> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
