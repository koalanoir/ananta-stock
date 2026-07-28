"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/platform-admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) return setError(result.error ?? "Connexion impossible.");
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[#f5f7f6] lg:grid-cols-[0.8fr_1.2fr]">
      <section className="hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} className="text-[#e9b18d]" />
          <span className="text-xl font-bold tracking-[0.12em]">ANANTA ADMIN</span>
        </div>
        <div className="my-auto max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e9b18d]">
            Administration plateforme
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight">
            Contrôlez les comptes et les fonctions accessibles.
          </h1>
          <p className="mt-5 leading-7 text-white/65">
            Cet espace est séparé des comptes commerçants et protégé par une session signée.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand-strong">
            <LockKeyhole size={23} />
          </span>
          <h2 className="mt-6 text-3xl font-semibold">Connexion administrateur</h2>
          <p className="mt-2 text-sm leading-6 text-foreground/50">
            Utilisez les identifiants configurés dans l’environnement de production.
          </p>
          <label className="mt-7 block text-sm font-semibold">
            Nom d’utilisateur
            <span className="relative mt-2 block">
              <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={18} />
              <input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} />
            </span>
          </label>
          <label className="mt-5 block text-sm font-semibold">
            Mot de passe
            <span className="relative mt-2 block">
              <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={18} />
              <input required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} pr-12`} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error ? <p role="alert" className="mt-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}
          <button disabled={pending} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white disabled:opacity-50">
            {pending ? <><LoaderCircle size={18} className="animate-spin" /> Connexion…</> : "Accéder à l’administration"}
          </button>
        </form>
      </section>
    </main>
  );
}

const inputClass = "h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 font-normal outline-none focus:border-brand focus:ring-3 focus:ring-brand/10";
