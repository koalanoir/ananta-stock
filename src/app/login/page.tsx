"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setIsLoading(true);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setError(
        "La connexion à Supabase n’est pas configurée. Vérifiez votre fichier .env.local.",
      );
      setIsLoading(false);
      return;
    }

    // 1. Authentification avec Supabase
    const {
      data: loginData,
      error: loginError,
    } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (loginError || !loginData.user) {
      setError("Adresse e-mail ou mot de passe incorrect.");
      setIsLoading(false);
      return;
    }

    // 2. Récupération du rôle de l’utilisateur
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        role,
        organization_id,
        organizations (
          name
        )
      `)
      .eq("user_id", loginData.user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      await supabase.auth.signOut();

      setError(
        "Votre compte n’est associé à aucun commerce. Contactez votre gestionnaire.",
      );

      setIsLoading(false);
      return;
    }

    // 3. Redirection selon le rôle
    if (membership.role === "seller") {
      router.replace("/sales");
    } else {
      router.replace("/");
    }

    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_1.05fr]">
      {/* Présentation desktop */}
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/15 blur-3xl"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-white/5 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <p className="text-3xl font-bold tracking-[0.15em]">
            ANANTA
          </p>

          <p className="mt-1 text-xs tracking-[0.45em] text-[#e9b18d]">
            STOCK
          </p>
        </div>

        <div className="relative z-10 my-auto max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
            Gestion simplifiée
          </p>

          <h1 className="mt-5 text-4xl font-semibold leading-tight">
            Votre commerce sous contrôle, à chaque instant.
          </h1>

          <p className="mt-5 max-w-md leading-7 text-white/60">
            Enregistrez les ventes, suivez les mouvements et consultez les
            performances de votre activité depuis un espace sécurisé.
          </p>

          <div className="mt-10 space-y-4">
            <Feature text="Mise à jour rapide des stocks" />
            <Feature text="Accès adapté à chaque utilisateur" />
            <Feature text="Historique complet des mouvements" />
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/35">
          Une solution Ananta Group
        </p>
      </section>

      {/* Formulaire */}
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="mb-10 lg:hidden">
            <p className="text-2xl font-bold tracking-[0.13em]">
              ANANTA <span className="text-brand">STOCK</span>
            </p>
          </div>

          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand-strong">
            <ShieldCheck size={21} />
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">
            Espace sécurisé
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Se connecter
          </h2>

          <p className="mt-2 text-sm leading-6 text-foreground/55">
            Utilisez les identifiants associés à votre commerce.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* E-mail */}
            <label className="block">
              <span className="text-sm font-semibold">
                Adresse e-mail
              </span>

              <span className="relative mt-2 block">
                <Mail
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35"
                  aria-hidden="true"
                />

                <input
                  required
                  autoFocus
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nom@commerce.com"
                  className="h-13 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none transition placeholder:text-foreground/30 focus:border-brand focus:ring-3 focus:ring-brand/10"
                />
              </span>
            </label>

            {/* Mot de passe */}
            <label className="block">
              <span className="text-sm font-semibold">
                Mot de passe
              </span>

              <span className="relative mt-2 block">
                <LockKeyhole
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35"
                  aria-hidden="true"
                />

                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Votre mot de passe"
                  className="h-13 w-full rounded-xl border border-border bg-surface pl-11 pr-12 text-sm outline-none transition placeholder:text-foreground/30 focus:border-brand focus:ring-3 focus:ring-brand/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-foreground/45 transition hover:bg-surface-muted hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </span>
            </label>

            {/* Erreur */}
            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-5 text-danger"
              >
                {error}
              </p>
            ) : null}

            {/* Connexion */}
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white shadow-[0_10px_24px_rgb(173_84_38_/_18%)] transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Connexion…
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-border pt-6 text-center">
            <p className="text-xs leading-5 text-foreground/45">
              Vous avez perdu vos identifiants ?
              <br />
              Contactez le gestionnaire de votre commerce.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/75">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10">
        <span className="h-1.5 w-1.5 rounded-full bg-[#e9b18d]" />
      </span>

      <span>{text}</span>
    </div>
  );
}