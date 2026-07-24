"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export type SellerSummary = {
  id: string;
  name: string;
  email: string;
  status: "En poste" | "Hors ligne";
  hours: string;
  hoursWorked: number;
  sales: number;
  unitsSold: number;
};

type SettingsClientProps = {
  organizationId: string;
  storeId: string;
  storeName: string;
  role: Extract<UserRole, "owner" | "manager">;
  initialSellers: SellerSummary[];
};

export function SettingsClient({
  organizationId,
  storeId,
  storeName,
  role,
  initialSellers,
}: SettingsClientProps) {
  const router = useRouter();

  const [sellers, setSellers] = useState(initialSellers);
  const [showInvitation, setShowInvitation] = useState(false);
  const [email, setEmail] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const activeSellers = useMemo(
    () => sellers.filter((seller) => seller.status === "En poste").length,
    [sellers],
  );

  const totalHours = useMemo(
    () =>
      sellers.reduce(
        (total, seller) => total + seller.hoursWorked,
        0,
      ),
    [sellers],
  );

  const totalSales = useMemo(
    () =>
      sellers.reduce(
        (total, seller) => total + seller.sales,
        0,
      ),
    [sellers],
  );

  function closeInvitation() {
    if (pending) return;

    setShowInvitation(false);
    setEmail("");
    setInvitationUrl("");
    setErrorMessage("");
    setCopied(false);
  }

  async function createInvitation(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage("Renseigne l’adresse e-mail du vendeur.");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setErrorMessage("Supabase n’est pas configuré.");
      return;
    }

    setPending(true);
    setErrorMessage("");
    setInvitationUrl("");

    // Le token brut est transmis au vendeur.
    // Supabase ne conserve que son empreinte SHA-256.
    const rawToken =
      crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", "");

    const { error } = await supabase.rpc("create_user_invitation", {
      target_organization_id: organizationId,
      target_store_id: storeId,
      target_email: normalizedEmail,
      target_role: "seller",
      raw_token: rawToken,
    });

    setPending(false);

    if (error) {
      setErrorMessage(
        `Impossible de créer l’invitation : ${error.message}`,
      );
      return;
    }

    const url = new URL(
      "/accept-invitation",
      window.location.origin,
    );

    url.searchParams.set("token", rawToken);

    setInvitationUrl(url.toString());
  }

  async function copyInvitation() {
    if (!invitationUrl) return;

    await navigator.clipboard.writeText(invitationUrl);

    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  async function disableSeller(seller: SellerSummary) {
    const confirmed = window.confirm(
      `Désactiver l’accès de ${seller.name} ? Son historique de ventes sera conservé.`,
    );

    if (!confirmed) return;

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setErrorMessage("Supabase n’est pas configuré.");
      return;
    }

    setDisablingId(seller.id);
    setErrorMessage("");

    const { error } = await supabase.rpc(
      "set_membership_active",
      {
        target_organization_id: organizationId,
        target_user_id: seller.id,
        new_active_value: false,
      },
    );

    setDisablingId(null);

    if (error) {
      setErrorMessage(
        `Impossible de désactiver le vendeur : ${error.message}`,
      );
      return;
    }

    setSellers((current) =>
      current.filter((item) => item.id !== seller.id),
    );

    router.refresh();
  }

  return (
    <AppShell active="settings" role={role}>
      <PageHeading
        eyebrow="Administration"
        title="Paramètres"
        description={`Gérez les accès vendeurs, les horaires et l’activité de ${storeName}.`}
        action={
          <button
            type="button"
            onClick={() => setShowInvitation(true)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            <Plus size={18} aria-hidden="true" />
            Créer un vendeur
          </button>
        }
      />

      {errorMessage && !showInvitation ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-medium text-danger"
        >
          {errorMessage}
        </div>
      ) : null}

      <section
        className="mt-8 grid gap-4 sm:grid-cols-3"
        aria-label="Résumé de l’équipe"
      >
        <Summary
          icon={<UserRound size={18} />}
          label="Vendeurs en poste"
          value={`${activeSellers} / ${sellers.length}`}
        />

        <Summary
          icon={<Clock3 size={18} />}
          label="Heures aujourd’hui"
          value={`${totalHours.toLocaleString("fr-FR", {
            maximumFractionDigits: 1,
          })} h`}
        />

        <Summary
          icon={<ShieldCheck size={18} />}
          label="Ventes enregistrées"
          value={String(totalSales)}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
        <div className="border-b border-border px-5 py-5">
          <h2 className="text-xl font-semibold">Équipe de vente</h2>
          <p className="mt-1 text-sm text-foreground/50">
            Activité et résultats de la journée
          </p>
        </div>

        {sellers.length ? (
          <div className="divide-y divide-border">
            {sellers.map((seller) => {
              const isDisabling = disablingId === seller.id;

              return (
                <article
                  key={seller.id}
                  className="grid gap-4 p-5 md:grid-cols-[1.2fr_1fr_0.7fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {seller.name}
                    </p>

                    {seller.email ? (
                      <p className="mt-1 break-all text-xs text-foreground/45">
                        {seller.email}
                      </p>
                    ) : null}

                    <p
                      className={`mt-2 text-xs font-semibold ${
                        seller.status === "En poste"
                          ? "text-success"
                          : "text-foreground/45"
                      }`}
                    >
                      ● {seller.status}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-foreground/40">
                      Horaires
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {seller.hours}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-foreground/40">
                      Ventes
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold">
                      {seller.sales}
                    </p>
                    <p className="mt-1 text-xs text-foreground/45">
                      {seller.unitsSold} article
                      {seller.unitsSold > 1 ? "s" : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isDisabling}
                    onClick={() => disableSeller(seller)}
                    aria-label={`Désactiver ${seller.name}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 text-xs font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50"
                  >
                    {isDisabling ? (
                      <LoaderCircle
                        className="animate-spin"
                        size={15}
                      />
                    ) : (
                      <Trash2 size={15} />
                    )}
                    Désactiver
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <UserRound
              className="mx-auto text-foreground/25"
              size={32}
            />
            <p className="mt-4 font-semibold">
              Aucun vendeur actif
            </p>
            <p className="mt-2 text-sm text-foreground/50">
              Crée une invitation pour ajouter le premier vendeur.
            </p>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs leading-5 text-foreground/45">
        Les accès sont désactivés sans supprimer les ventes, les
        mouvements et les horaires associés.
      </p>

      {showInvitation ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invitation-title"
          className="fixed inset-0 z-50 grid place-items-center bg-sidebar/55 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="invitation-title"
                  className="text-xl font-semibold"
                >
                  Inviter un vendeur
                </h2>
                <p className="mt-1 text-sm text-foreground/50">
                  Le vendeur sera associé à {storeName}.
                </p>
              </div>

              <button
                type="button"
                onClick={closeInvitation}
                aria-label="Fermer"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-surface-muted"
              >
                <X size={18} />
              </button>
            </div>

            {!invitationUrl ? (
              <form
                onSubmit={createInvitation}
                className="mt-6"
              >
                <label
                  htmlFor="seller-email"
                  className="text-sm font-semibold"
                >
                  Adresse e-mail
                </label>

                <input
                  id="seller-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="vendeur@exemple.com"
                  className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:border-brand focus:ring-3 focus:ring-brand/10"
                />

                {errorMessage ? (
                  <p
                    role="alert"
                    className="mt-3 text-sm text-danger"
                  >
                    {errorMessage}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <LoaderCircle
                        className="animate-spin"
                        size={17}
                      />
                      Création…
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      Générer l’invitation
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="mt-6">
                <div className="rounded-xl bg-success/10 p-4 text-sm text-success">
                  <p className="flex items-center gap-2 font-semibold">
                    <Check size={18} />
                    Invitation créée
                  </p>
                  <p className="mt-2 leading-5">
                    Envoie ce lien au vendeur. Il devra utiliser
                    l’adresse {email}.
                  </p>
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    readOnly
                    value={invitationUrl}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xs"
                  />

                  <button
                    type="button"
                    onClick={copyInvitation}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-surface-muted"
                  >
                    {copied ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}
                    {copied ? "Copié" : "Copier"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={closeInvitation}
                  className="mt-5 h-11 w-full rounded-xl border border-border text-sm font-semibold hover:bg-surface-muted"
                >
                  Terminer
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand-strong">
        {icon}
      </span>
      <p className="mt-4 text-sm text-foreground/55">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">
        {value}
      </p>
    </article>
  );
}