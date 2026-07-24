"use client";

import Link from "next/link";
import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { SellerLoginForm } from "@/components/seller-login-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Membership = {
  role: "owner" | "manager" | "seller";
};

type LoginMode = "manager" | "seller";

export default function LoginPage() {
  const router = useRouter();

  const [loginMode, setLoginMode] =
    useState<LoginMode>("manager");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [pending, setPending] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  function changeLoginMode(mode: LoginMode) {
    setLoginMode(mode);
    setErrorMessage("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const supabase =
      getSupabaseBrowserClient();

    if (!supabase) {
      setErrorMessage(
        "Supabase n’est pas configuré.",
      );
      return;
    }

    setPending(true);
    setErrorMessage("");

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (error) {
      setPending(false);
      setErrorMessage(
        "Adresse e-mail ou mot de passe incorrect.",
      );
      return;
    }

    let {
      data: membershipData,
      error: membershipError,
    } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      await supabase.auth.signOut();

      setPending(false);

      setErrorMessage(
        `Impossible de vérifier votre accès : ${membershipError.message}`,
      );

      return;
    }

    /*
     * Récupération d’un propriétaire dont l’e-mail
     * a été confirmé sans passer par le callback.
     */
    if (
      !membershipData &&
      data.user.user_metadata
        ?.account_type === "owner"
    ) {
      const organizationName = String(
        data.user.user_metadata
          ?.organization_name ?? "",
      ).trim();

      const storeName = String(
        data.user.user_metadata
          ?.store_name ?? "",
      ).trim();

      if (organizationName && storeName) {
        const { error: onboardingError } =
          await supabase.rpc(
            "create_organization",
            {
              organization_name:
                organizationName,
              store_name: storeName,
            },
          );

        if (onboardingError) {
          await supabase.auth.signOut();

          setPending(false);

          setErrorMessage(
            `Votre compte est confirmé, mais votre commerce n’a pas pu être créé : ${onboardingError.message}`,
          );

          return;
        }

        const membershipResult =
          await supabase
            .from("memberships")
            .select("role")
            .eq(
              "user_id",
              data.user.id,
            )
            .eq("active", true)
            .limit(1)
            .maybeSingle();

        membershipData =
          membershipResult.data;

        membershipError =
          membershipResult.error;
      }
    }

    if (
      membershipError ||
      !membershipData
    ) {
      await supabase.auth.signOut();

      setPending(false);

      setErrorMessage(
        membershipError
          ? `Impossible de vérifier votre accès : ${membershipError.message}`
          : "Votre compte n’est associé à aucun commerce.",
      );

      return;
    }

    const membership =
      membershipData as Membership;

    const requestedDestination =
      new URLSearchParams(
        window.location.search,
      ).get("next");

    const safeDestination =
      requestedDestination?.startsWith(
        "/",
      ) &&
      !requestedDestination.startsWith(
        "//",
      )
        ? requestedDestination
        : membership.role === "seller"
          ? "/sales"
          : "/";

    setPending(false);

    router.replace(safeDestination);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[0.85fr_1.15fr]">
      <section className="hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <Link
          href="/"
          aria-label="Accueil Ananta Stock"
        >
          <span className="block text-3xl font-bold tracking-[0.13em]">
            ANANTA
          </span>

          <span className="mt-1 block text-xs tracking-[0.42em] text-[#e9b18d]">
            STOCK
          </span>
        </Link>

        <div className="my-auto max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e9b18d]">
            Bon retour
          </p>

          <h1 className="mt-5 text-4xl font-semibold leading-tight">
            Vos stocks et vos ventes, au même
            endroit.
          </h1>

          <p className="mt-5 leading-7 text-white/65">
            Connectez-vous pour accéder à votre
            boutique et reprendre votre activité.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="font-bold tracking-[0.12em] lg:hidden"
          >
            ANANTA{" "}
            <span className="text-brand">
              STOCK
            </span>
          </Link>

          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong lg:mt-0">
            Connexion
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Accéder à votre espace
          </h2>

          <p className="mt-3 text-sm leading-6 text-foreground/55">
            {loginMode === "manager"
              ? "Connectez-vous avec l’adresse e-mail associée à votre organisation."
              : "Connectez-vous avec le code de votre boutique, votre identifiant et votre PIN."}
          </p>

          <div className="mt-8 grid grid-cols-2 rounded-xl bg-surface-muted p-1">
            <button
              type="button"
              onClick={() =>
                changeLoginMode("manager")
              }
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                loginMode === "manager"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground/70"
              }`}
            >
              Gestionnaire
            </button>

            <button
              type="button"
              onClick={() =>
                changeLoginMode("seller")
              }
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                loginMode === "seller"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground/70"
              }`}
            >
              Vendeur
            </button>
          </div>

          {loginMode === "manager" ? (
            <>
              <form
                onSubmit={handleSubmit}
                className="mt-6 space-y-5"
              >
                <Field
                  id="login-email"
                  label="Adresse e-mail"
                  icon={<Mail size={18} />}
                >
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value,
                      )
                    }
                    placeholder="vous@entreprise.com"
                    className={inputClass}
                  />
                </Field>

                <Field
                  id="login-password"
                  label="Mot de passe"
                  icon={
                    <LockKeyhole size={18} />
                  }
                >
                  <input
                    id="login-password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target.value,
                      )
                    }
                    placeholder="Votre mot de passe"
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current,
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </Field>

                {errorMessage ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-medium text-danger"
                  >
                    {errorMessage}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? (
                    <>
                      <LoaderCircle
                        className="animate-spin"
                        size={18}
                      />
                      Connexion…
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </button>
              </form>

              <p className="mt-7 text-center text-sm text-foreground/55">
                Vous n’avez pas encore de
                compte ?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-brand-strong hover:underline"
                >
                  Créer un espace
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mt-6">
                <SellerLoginForm />
              </div>

              <p className="mt-7 text-center text-xs leading-5 text-foreground/45">
                Votre compte vendeur est créé par
                le gestionnaire de votre boutique.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/10";

function Field({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-semibold"
      >
        {label}
      </label>

      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35">
          {icon}
        </span>

        {children}
      </div>
    </div>
  );
}