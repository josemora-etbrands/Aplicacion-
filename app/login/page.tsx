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
  const [error, setError] = useState<string | null>(params.get("error"));
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
      <a href="/api/auth/google"
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-6 py-2.5 rounded-xl transition-colors">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continuar con Google
      </a>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] text-slate-400 uppercase tracking-wider">o con correo</span>
        <div className="flex-1 h-px bg-slate-200" />
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
