"use client";

import { useMemo, useState } from "react";
import {
  Clock3,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app-shell";
import { CreateSellerModal } from "@/components/create-seller-modal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export type SellerSummary = {
  id: string;
  name: string;
  username: string;
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

  const [sellers, setSellers] =
    useState(initialSellers);

  const [
    showCreateSeller,
    setShowCreateSeller,
  ] = useState(false);

  const [disablingId, setDisablingId] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const activeSellers = useMemo(
    () =>
      sellers.filter(
        (seller) =>
          seller.status === "En poste",
      ).length,
    [sellers],
  );

  const totalHours = useMemo(
    () =>
      sellers.reduce(
        (total, seller) =>
          total + seller.hoursWorked,
        0,
      ),
    [sellers],
  );

  const totalSales = useMemo(
    () =>
      sellers.reduce(
        (total, seller) =>
          total + seller.sales,
        0,
      ),
    [sellers],
  );

  async function disableSeller(
    seller: SellerSummary,
  ) {
    const confirmed = window.confirm(
      `Désactiver l’accès de ${seller.name} ? Son historique de ventes sera conservé.`,
    );

    if (!confirmed) return;

    const supabase =
      getSupabaseBrowserClient();

    if (!supabase) {
      setErrorMessage(
        "Supabase n’est pas configuré.",
      );
      return;
    }

    setDisablingId(seller.id);
    setErrorMessage("");

    const { error } = await supabase.rpc(
      "set_membership_active",
      {
        target_organization_id:
          organizationId,
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
      current.filter(
        (item) => item.id !== seller.id,
      ),
    );

    router.refresh();
  }

  return (
    <AppShell
      active="settings"
      role={role}
    >
      <PageHeading
        eyebrow="Administration"
        title="Paramètres"
        description={`Gérez les accès vendeurs, les horaires et l’activité de ${storeName}.`}
        action={
          <button
            type="button"
            onClick={() =>
              setShowCreateSeller(true)
            }
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            <Plus
              size={18}
              aria-hidden="true"
            />
            Créer un vendeur
          </button>
        }
      />

      {errorMessage ? (
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
          value={`${totalHours.toLocaleString(
            "fr-FR",
            {
              maximumFractionDigits: 1,
            },
          )} h`}
        />

        <Summary
          icon={<ShieldCheck size={18} />}
          label="Ventes enregistrées"
          value={String(totalSales)}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
        <div className="border-b border-border px-5 py-5">
          <h2 className="text-xl font-semibold">
            Équipe de vente
          </h2>

          <p className="mt-1 text-sm text-foreground/50">
            Activité et résultats de la journée
          </p>
        </div>

        {sellers.length ? (
          <div className="divide-y divide-border">
            {sellers.map((seller) => {
              const isDisabling =
                disablingId === seller.id;

              return (
                <article
                  key={seller.id}
                  className="grid gap-4 p-5 md:grid-cols-[1.2fr_1fr_0.7fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {seller.name}
                    </p>

                    <p className="mt-1 break-all text-xs text-foreground/45">
                      @{seller.username}
                    </p>

                    <p
                      className={`mt-2 text-xs font-semibold ${
                        seller.status ===
                        "En poste"
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
                      {seller.unitsSold > 1
                        ? "s"
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isDisabling}
                    onClick={() =>
                      disableSeller(seller)
                    }
                    aria-label={`Désactiver ${seller.name}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 text-xs font-semibold text-danger transition hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDisabling ? (
                      <LoaderCircle
                        className="animate-spin"
                        size={15}
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2
                        size={15}
                        aria-hidden="true"
                      />
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
              aria-hidden="true"
            />

            <p className="mt-4 font-semibold">
              Aucun vendeur actif
            </p>

            <p className="mt-2 text-sm text-foreground/50">
              Crée un compte vendeur pour
              l’associer à cette boutique.
            </p>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs leading-5 text-foreground/45">
        Les accès sont désactivés sans supprimer
        les ventes, les mouvements et les horaires
        associés.
      </p>

      {showCreateSeller ? (
        <CreateSellerModal
          storeId={storeId}
          storeName={storeName}
          onClose={() =>
            setShowCreateSeller(false)
          }
          onCreated={(seller) => {
            setSellers((current) => [
              seller,
              ...current,
            ]);

            router.refresh();
          }}
        />
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