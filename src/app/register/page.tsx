"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Store,
  UserRound,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] =
    useState("");
  const [storeName, setStoreName] = useState("");
  const [businessType, setBusinessType] =
    useState<"retail" | "restaurant">("retail");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [
    passwordConfirmation,
    setPasswordConfirmation,
  ] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);
  const [pending, setPending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (password.length < 8) {
      setErrorMessage(
        "Le mot de passe doit contenir au moins 8 caractères.",
      );
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage(
        "Les deux mots de passe ne correspondent pas.",
      );
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setErrorMessage(
        "Supabase n’est pas configuré.",
      );
      return;
    }

    setPending(true);
    setErrorMessage("");

    const { data, error } =
      await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo:
            `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName.trim(),
            account_type: "owner",
            organization_name:
              organizationName.trim(),
            store_name: storeName.trim(),
            business_type: businessType,
          },
        },
      });

    if (error) {
      setPending(false);
      setErrorMessage(
        translateAuthError(error.message),
      );
      return;
    }

    /*
     * Si la confirmation d’e-mail est désactivée,
     * Supabase crée immédiatement une session.
     */
    if (data.session) {
      const { error: organizationError } =
        await supabase.rpc(
          "create_organization",
          {
            organization_name:
              organizationName.trim(),
            store_name: storeName.trim(),
            selected_business_type: businessType,
          },
        );

      if (organizationError) {
        setPending(false);
        setErrorMessage(
          `Compte créé, mais l’espace n’a pas pu être initialisé : ${organizationError.message}`,
        );
        return;
      }

      const sessionResponse = await fetch(
        "/api/auth/session-context",
        { method: "POST" },
      );

      if (!sessionResponse.ok) {
        const result = (await sessionResponse.json()) as { error?: string };
        await supabase.auth.signOut();
        setPending(false);
        setErrorMessage(
          result.error ??
            "Le compte a été créé, mais la session n’a pas pu être initialisée.",
        );
        return;
      }

      const sessionResult = (await sessionResponse.json()) as {
        destination?: string;
      };
      setPending(false);
      router.replace(sessionResult.destination ?? "/stocks");
      router.refresh();
      return;
    }

    /*
     * Si la confirmation d’e-mail est activée,
     * le callback créera l’organisation.
     */
    setPending(false);
    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 text-center shadow-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 size={28} />
          </span>

          <h1 className="mt-6 text-2xl font-semibold">
            Vérifiez votre boîte e-mail
          </h1>

          <p className="mt-3 text-sm leading-6 text-foreground/55">
            Un lien de confirmation a été envoyé à{" "}
            <span className="font-semibold text-foreground">
              {email}
            </span>
            .
          </p>

          <p className="mt-2 text-sm leading-6 text-foreground/55">
            Votre entreprise et votre boutique seront
            créées après confirmation.
          </p>

          <Link
            href="/login"
            className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-sidebar px-4 text-sm font-semibold text-white"
          >
            Revenir à la connexion
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[0.8fr_1.2fr]">
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
            Gestion simplifiée
          </p>

          <h2 className="mt-5 text-4xl font-semibold leading-tight">
            Créez l’espace de gestion de votre commerce.
          </h2>

          <p className="mt-5 leading-7 text-white/65">
            Suivez vos stocks, vos ventes et l’activité
            de votre équipe depuis une interface unique.
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-xl">
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
            Créer votre espace
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Démarrer avec Ananta Stock
          </h1>

          <p className="mt-3 text-sm leading-6 text-foreground/55">
            Ce compte sera le propriétaire de
            l’organisation.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
          >
            <Field
              id="full-name"
              label="Nom complet"
              icon={<UserRound size={18} />}
            >
              <input
                id="full-name"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(event) =>
                  setFullName(event.target.value)
                }
                placeholder="Dorian Ng"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="organization-name"
                label="Nom de l’entreprise"
                icon={<Building2 size={18} />}
              >
                <input
                  id="organization-name"
                  type="text"
                  required
                  value={organizationName}
                  onChange={(event) =>
                    setOrganizationName(
                      event.target.value,
                    )
                  }
                  placeholder="Groupe Ananta"
                  className={inputClass}
                />
              </Field>

              <Field
                id="store-name"
                label="Nom de la boutique"
                icon={<Store size={18} />}
              >
                <input
                  id="store-name"
                  type="text"
                  required
                  value={storeName}
                  onChange={(event) =>
                    setStoreName(event.target.value)
                  }
                  placeholder="Marché Central"
                  className={inputClass}
                />
              </Field>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold">
                Type d’établissement
              </legend>
              <p className="mt-1 text-xs leading-5 text-foreground/50">
                Ce choix détermine les outils proposés. Après la création,
                seul l’administrateur de la plateforme pourra le modifier.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <BusinessTypeChoice
                  checked={businessType === "retail"}
                  title="Commerce / épicerie"
                  description="Stocks, ventes rapides, clients et factures."
                  onSelect={() => setBusinessType("retail")}
                />
                <BusinessTypeChoice
                  checked={businessType === "restaurant"}
                  title="Restaurant / bar"
                  description="Carte, recettes, caisse et commandes en salle."
                  onSelect={() => setBusinessType("restaurant")}
                />
              </div>
            </fieldset>

            <Field
              id="register-email"
              label="Adresse e-mail"
              icon={<Mail size={18} />}
            >
              <input
                id="register-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="vous@entreprise.com"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="register-password"
                label="Mot de passe"
                icon={<LockKeyhole size={18} />}
              >
                <input
                  id="register-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="8 caractères minimum"
                  className={`${inputClass} pr-12`}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current,
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

              <Field
                id="password-confirmation"
                label="Confirmer"
                icon={<LockKeyhole size={18} />}
              >
                <input
                  id="password-confirmation"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) =>
                    setPasswordConfirmation(
                      event.target.value,
                    )
                  }
                  placeholder="Répétez le mot de passe"
                  className={inputClass}
                />
              </Field>
            </div>

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
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60"
            >
              {pending ? (
                <>
                  <LoaderCircle
                    className="animate-spin"
                    size={18}
                  />
                  Création…
                </>
              ) : (
                "Créer mon espace"
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-foreground/55">
            Vous avez déjà un compte ?{" "}
            <Link
              href="/login"
              className="font-semibold text-brand-strong hover:underline"
            >
              Se connecter
            </Link>
          </p>
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

function BusinessTypeChoice({
  checked,
  title,
  description,
  onSelect,
}: {
  checked: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`cursor-pointer rounded-2xl border p-4 transition ${
        checked
          ? "border-brand bg-brand/5 ring-2 ring-brand/10"
          : "border-border bg-surface hover:border-brand/35"
      }`}
    >
      <input
        type="radio"
        name="business-type"
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="flex items-center justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span
          className={`grid h-5 w-5 place-items-center rounded-full border ${
            checked ? "border-brand bg-brand" : "border-border"
          }`}
          aria-hidden="true"
        >
          {checked ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
        </span>
      </span>
      <span className="mt-2 block text-xs leading-5 text-foreground/50">
        {description}
      </span>
    </label>
  );
}

function translateAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("already registered")) {
    return "Un compte existe déjà avec cette adresse e-mail.";
  }

  if (normalized.includes("password")) {
    return "Le mot de passe ne respecte pas les règles de sécurité.";
  }

  if (normalized.includes("rate limit")) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }

  return message;
}
