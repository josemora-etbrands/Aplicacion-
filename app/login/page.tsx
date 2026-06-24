"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/app/components/Logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const o = await res.json();
      if (!res.ok) { setError(o.error ?? "Error"); return; }
      router.push(params.get("from") || "/");
      router.refresh();
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-5">
      <div className="flex justify-center"><Logo className="w-24 h-auto" /></div>
      <div className="text-center">
        <h1 className="text-lg font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="text-xs text-slate-400 mt-0.5">Acceso al panel de ET Brands</p>
      </div>
      <div className="space-y-3">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@etbrands.cl" autoComplete="email" required
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" autoComplete="current-password" required
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors">
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
      <p className="text-center text-xs text-slate-400">
        ¿No tienes cuenta? <Link href="/registro" className="text-blue-600 hover:underline">Crear cuenta</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
