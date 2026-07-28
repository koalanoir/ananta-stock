import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export default async function FeatureDisabledPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 text-center shadow-xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand-strong">
          <LockKeyhole size={26} />
        </span>
        <h1 className="mt-6 text-2xl font-semibold">Fonction désactivée</h1>
        <p className="mt-3 text-sm leading-6 text-foreground/55">
          Cette fonctionnalité n’est pas activée pour votre compte
          {feature ? ` (${feature})` : ""}. Contactez l’administrateur de la
          plateforme si vous souhaitez l’utiliser.
        </p>
        <Link
          href="/settings"
          className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-sidebar px-4 text-sm font-semibold text-white"
        >
          Ouvrir les paramètres
        </Link>
      </section>
    </main>
  );
}
