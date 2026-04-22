"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/",            icon: "⬡", label: "Dashboard"          },
  { href: "/red-zone",    icon: "⚠", label: "Inventario Crítico"  },
  { href: "/ia-history",  icon: "◈", label: "Historial de IA"     },
  { href: "/api-config",  icon: "⚙", label: "Configuración API"   },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex flex-col w-60 min-h-screen bg-[#111111] border-r border-white/5">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/5">
        <span className="text-[#3b82f6] font-bold text-lg tracking-tight">ET Brands</span>
        <span className="text-white/30 text-xs block mt-0.5">Analysis Platform</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20"
                  : "text-white/50 hover:text-white hover:bg-white/5"}`}>
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-white/30">Agente IA activo</span>
        </div>
      </div>
    </aside>
  );
}
