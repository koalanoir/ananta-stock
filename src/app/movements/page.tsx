import { Download, Filter } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  MovementType,
  UserRole,
} from "@/lib/types";

const labels: Record<MovementType, string> = {
  entree: "Entrée",
  vente: "Vente",
  sortie: "Sortie",
  perte: "Perte",
  ajustement: "Ajustement",
};

type MembershipRow = {
  organization_id: string;
  store_id: string | null;
  role: UserRole;
  stores: {
    name: string;
    timezone: string;
  } | null;
};

type MovementRow = {
  id: string;
  type: MovementType;
  quantity_delta: number | string;
  quantity_before: number | string;
  quantity_after: number | string;
  reason: string | null;
  created_at: string;
  item: {
    name: string;
    brand: string;
    unit: string;
    category: {
      name: string;
    } | null;
  } | null;
  author: {
    full_name: string;
  } | null;
};

export default async function MovementsPage() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-danger/20 bg-surface p-6 text-center">
          <h1 className="text-xl font-semibold">
            Supabase n’est pas configuré
          </h1>

          <p className="mt-3 text-sm text-foreground/55">
            Vérifie les variables présentes dans ton fichier
            .env.local.
          </p>
        </div>
      </main>
    );
  }

  /*
   * Vérification de l’utilisateur.
   */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  /*
   * Recherche du rôle et du magasin de l’utilisateur.
   */
  const { data: membershipData, error: membershipError } =
    await supabase
      .from("memberships")
      .select(`
        organization_id,
        store_id,
        role,
        stores (
          name,
          timezone
        )
      `)
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

  if (membershipError) {
    throw new Error(
      `Impossible de charger le commerce : ${membershipError.message}`,
    );
  }

  if (!membershipData) {
    redirect("/login?error=no-membership");
  }

  const membership =
    membershipData as unknown as MembershipRow;

  if (!membership.store_id) {
    throw new Error(
      "Aucun magasin n’est associé à cet utilisateur.",
    );
  }

  const storeId = membership.store_id;
  const storeName =
    membership.stores?.name ?? "Mon commerce";
  const timezone =
    membership.stores?.timezone ??
    "Africa/Brazzaville";

  /*
   * Chargement des mouvements.
   *
   * La politique RLS fait automatiquement la différence :
   * - owner/manager : tous les mouvements du magasin ;
   * - seller : uniquement ses propres mouvements.
   */
  const { data, error } = await supabase
    .from("inventory_movements")
    .select(`
      id,
      type,
      quantity_delta,
      quantity_before,
      quantity_after,
      reason,
      created_at,
      item:items!inventory_movements_item_id_fkey (
        name,
        brand,
        unit,
        category:categories (
          name
        )
      ),
      author:profiles!inventory_movements_created_by_fkey (
        full_name
      )
    `)
    .eq("store_id", storeId)
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (error) {
    throw new Error(
      `Impossible de charger les mouvements : ${error.message}`,
    );
  }

  const movements =
    (data ?? []) as unknown as MovementRow[];

  const sellerMode =
    membership.role === "seller";

  return (
    <AppShell
      active="movements"
      role={sellerMode ? "seller" : "manager"}
    >
      <PageHeading
        title="Mouvements"
        description={`Historique des variations du stock de ${storeName}.`}
        action={
          <button
            type="button"
            disabled
            title="L’export CSV sera connecté dans une prochaine étape"
            className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold opacity-50 shadow-sm"
          >
            <Download size={17} />
            Exporter en CSV
          </button>
        }
      />

      <div className="mt-8 flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm text-foreground/55">
        <Filter size={17} />

        <span>
          {movements.length} dernier
          {movements.length > 1 ? "s" : ""} mouvement
          {movements.length > 1 ? "s" : ""}
          {" · "}
          {sellerMode
            ? "Mes opérations"
            : "Tous les utilisateurs"}
        </span>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
        {/* Affichage mobile */}
        <div className="divide-y divide-border md:hidden">
          {movements.map((movement) => {
            const quantity =
              Number(movement.quantity_delta);

            return (
              <article
                key={movement.id}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold leading-5">
                      {getProductName(
                        movement.item?.name ??
                          "Article supprimé",
                        movement.item?.brand ?? "",
                      )}
                    </h2>

                    <p className="mt-1.5 text-xs text-foreground/48">
                      {formatMovementDate(
                        movement.created_at,
                        timezone,
                      )}
                    </p>

                    {movement.item?.category?.name ? (
                      <p className="mt-1 text-xs text-foreground/40">
                        {movement.item.category.name}
                      </p>
                    ) : null}
                  </div>

                  <span
                    className={`shrink-0 font-mono text-xl font-semibold ${
                      quantity > 0
                        ? "text-success"
                        : "text-danger"
                    }`}
                  >
                    {quantity > 0 ? "+" : ""}
                    {formatQuantity(quantity)}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface-muted/55 p-3 text-xs">
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-[0.08em] text-foreground/42">
                      Mouvement
                    </dt>

                    <dd className="mt-1.5">
                      <MovementBadge
                        type={movement.type}
                      />
                    </dd>
                  </div>

                  <div className="border-l border-border pl-3">
                    <dt className="text-[0.65rem] uppercase tracking-[0.08em] text-foreground/42">
                      Effectué par
                    </dt>

                    <dd className="mt-1.5 font-semibold">
                      {movement.author?.full_name ||
                        "Utilisateur"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex items-center justify-between text-xs text-foreground/50">
                  <span>
                    Avant :{" "}
                    <strong className="font-mono text-foreground/70">
                      {formatQuantity(
                        Number(
                          movement.quantity_before,
                        ),
                      )}
                    </strong>
                  </span>

                  <span>
                    Après :{" "}
                    <strong className="font-mono text-foreground/70">
                      {formatQuantity(
                        Number(
                          movement.quantity_after,
                        ),
                      )}
                    </strong>
                  </span>
                </div>

                {movement.reason ? (
                  <p className="mt-3 text-xs text-foreground/55">
                    <span className="font-semibold text-foreground/70">
                      Motif :
                    </span>{" "}
                    {movement.reason}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>

        {/* Tableau desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted/45 text-xs uppercase tracking-[0.07em] text-foreground/44">
              <tr>
                <th className="px-6 py-4 font-semibold">
                  Date
                </th>

                <th className="px-4 py-4 font-semibold">
                  Article
                </th>

                <th className="px-4 py-4 font-semibold">
                  Mouvement
                </th>

                <th className="px-4 py-4 font-semibold">
                  Quantité
                </th>

                <th className="px-4 py-4 font-semibold">
                  Stock
                </th>

                <th className="px-4 py-4 font-semibold">
                  Motif
                </th>

                <th className="px-6 py-4 font-semibold">
                  Effectué par
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {movements.map((movement) => {
                const quantity =
                  Number(movement.quantity_delta);

                return (
                  <tr
                    key={movement.id}
                    className="transition hover:bg-surface-muted/25"
                  >
                    <td className="whitespace-nowrap px-6 py-5 text-foreground/48">
                      {formatMovementDate(
                        movement.created_at,
                        timezone,
                      )}
                    </td>

                    <td className="px-4 py-5">
                      <p className="font-semibold">
                        {getProductName(
                          movement.item?.name ??
                            "Article supprimé",
                          movement.item?.brand ?? "",
                        )}
                      </p>

                      {movement.item?.category
                        ?.name ? (
                        <p className="mt-1 text-xs text-foreground/45">
                          {
                            movement.item
                              .category.name
                          }
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-5">
                      <MovementBadge
                        type={movement.type}
                      />
                    </td>

                    <td
                      className={`px-4 py-5 font-mono font-semibold ${
                        quantity > 0
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {quantity > 0 ? "+" : ""}
                      {formatQuantity(quantity)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-5 font-mono text-xs text-foreground/55">
                      {formatQuantity(
                        Number(
                          movement.quantity_before,
                        ),
                      )}
                      {" → "}
                      {formatQuantity(
                        Number(
                          movement.quantity_after,
                        ),
                      )}
                    </td>

                    <td className="max-w-56 px-4 py-5 text-foreground/55">
                      {movement.reason ?? "—"}
                    </td>

                    <td className="px-6 py-5 text-foreground/55">
                      {movement.author?.full_name ||
                        "Utilisateur"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {movements.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold">
              Aucun mouvement enregistré
            </p>

            <p className="mt-2 text-sm text-foreground/48">
              Les ventes et mises à jour de stock
              apparaîtront ici.
            </p>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function MovementBadge({
  type,
}: {
  type: MovementType;
}) {
  const colors: Record<MovementType, string> = {
    entree: "bg-success/10 text-success",
    vente: "bg-brand/10 text-brand-strong",
    sortie: "bg-danger/10 text-danger",
    perte: "bg-danger/10 text-danger",
    ajustement: "bg-warning/10 text-warning",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function getProductName(
  name: string,
  brand: string,
) {
  if (!brand) {
    return name;
  }

  if (
    name.toLowerCase().includes(
      brand.toLowerCase(),
    )
  ) {
    return name;
  }

  return `${name} ${brand}`;
}

function formatMovementDate(
  value: string,
  timezone: string,
) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 3,
  }).format(value);
}