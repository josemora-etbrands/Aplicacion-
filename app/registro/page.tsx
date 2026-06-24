"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/app/components/Logo";

export default function RegistroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const o = await res.json();
      if (!res.ok) { setError(o.error ?? "Error"); return; }
      router.push("/");
      router.refresh();
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-5">
        <div className="flex justify-center"><Logo className="w-24 h-auto" /></div>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">Crear cuenta</h1>
          <p className="text-xs text-slate-400 mt-0.5">Solo correos <b>@etbrands.cl</b></p>
        </div>
        <div className="space-y-3">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre (opcional)" autoComplete="name"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@etbrands.cl" autoComplete="email" required
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña (mín. 8 caracteres)" autoComplete="new-password" required
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors">
          {loading ? "Creando…" : "Crear cuenta"}
        </button>
        <p className="text-center text-xs text-slate-400">
          ¿Ya tienes cuenta? <Link href="/login" className="text-blue-600 hover:underline">Iniciar sesión</Link>
        </p>
      </form>
    </div>
  );
}
