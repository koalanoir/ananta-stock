import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  Coins,
  PackagePlus,
  Percent,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import {
  calculateProfitability,
  type ProfitabilityLoss,
  type ProfitabilitySale,
} from "@/lib/profitability";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  type MovementType,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const movementLabels: Record<MovementType, string> = {
  entree: "Entrée",
  vente: "Vente",
  sortie: "Sortie",
  perte: "Perte",
  ajustement: "Ajustement",
};

type StockStatus = "ok" | "surveillance" | "rupture";

type StockRow = {
  organization_id: string;
  store_id: string;
  item_id: string;
  name: string;
  brand: string;
  kind: "commercialise" | "outil" | "ingredient";
  unit: string;
  threshold: number | string;
  unit_cost: number | string;
  selling_price: number | string;
  quantity: number | string;
  stock_cost_value: number | string;
  potential_sales_value: number | string;
  stock_status: StockStatus;
};

type MovementRow = {
  id: string;
  type: MovementType;
  quantity_delta: number | string;
  reason: string | null;
  created_at: string;
  item: {
    name: string;
    brand: string;
  } | null;
  author: {
    full_name: string;
  } | null;
};

type ItemMetadataRow = {
  id: string;
  created_at: string;
};

type MembershipRow = {
  organization_id: string;
  store_id: string | null;
  role: "owner" | "manager" | "seller";
  organizations: {
    name: string;
  } | null;
  stores: {
    name: string;
    currency: string;
    timezone: string;
  } | null;
};

type DashboardPageProps = {
  searchParams: Promise<{ period?: string }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const requestedPeriod = Number((await searchParams).period);
  const periodDays = [7, 30, 90].includes(requestedPeriod)
    ? requestedPeriod
    : 30;
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-danger/20 bg-surface p-6 text-center">
          <h1 className="text-xl font-semibold">
            Supabase n’est pas configuré
          </h1>

          <p className="mt-3 text-sm leading-6 text-foreground/55">
            Vérifie les variables NEXT_PUBLIC_SUPABASE_URL et
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
          </p>
        </div>
      </main>
    );
  }

  /*
   * Vérification de l’utilisateur.
   * getUser() vérifie le compte auprès de Supabase Auth.
   */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  /*
   * Récupération du rôle, de l’entreprise et du magasin.
   * Pour le MVP, on prend la première appartenance active.
   */
  const { data: membershipData, error: membershipError } =
    await supabase
      .from("memberships")
      .select(`
        organization_id,
        store_id,
        role,
        organizations (
          name
        ),
        stores (
          name,
          currency,
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
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">
            Aucun commerce associé
          </h1>

          <p className="mt-3 text-sm leading-6 text-foreground/55">
            Votre compte existe, mais il n’est associé à aucune entreprise.
          </p>

          <p className="mt-2 text-sm leading-6 text-foreground/55">
            Créez votre commerce ou demandez une invitation à son
            propriétaire.
          </p>
        </div>
      </main>
    );
  }

  const membership = membershipData as unknown as MembershipRow;

  /*
   * Un vendeur ne doit pas arriver sur le dashboard gestionnaire.
   */
  if (membership.role === "seller") {
    redirect("/sales");
  }

  if (!membership.store_id) {
    throw new Error("Aucun magasin n’est associé à cet utilisateur.");
  }

  const storeId = membership.store_id;
  const storeName = membership.stores?.name ?? "Mon commerce";
  const currency = membership.stores?.currency ?? "XAF";
  const timezone =
    membership.stores?.timezone ?? "Africa/Brazzaville";

  /*
   * On récupère :
   * - la vue consolidée des stocks ;
   * - les mouvements des dernières 36 heures.
   *
   * Les politiques RLS empêchent automatiquement l’accès aux données
   * d’une autre entreprise.
   */
  const movementsSince = new Date(
    // Server-side request time used to bound the activity query.
    // eslint-disable-next-line react-hooks/purity
    Date.now() - 36 * 60 * 60 * 1000,
  ).toISOString();
  const performanceSince = new Date(
    // Server-side request time used to calculate the selected period.
    // eslint-disable-next-line react-hooks/purity
    Date.now() - periodDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const dormantSince = new Date(
    // Dormancy is intentionally fixed at 30 days, independently of the filter.
    // eslint-disable-next-line react-hooks/purity
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const salesHistorySince =
    performanceSince < dormantSince ? performanceSince : dormantSince;

  const [
    stockResponse,
    movementResponse,
    salesResponse,
    lossesResponse,
    itemMetadataResponse,
  ] = await Promise.all([
    supabase
      .from("stock_overview")
      .select(`
        organization_id,
        store_id,
        item_id,
        name,
        brand,
        kind,
        unit,
        threshold,
        unit_cost,
        selling_price,
        quantity,
        stock_cost_value,
        potential_sales_value,
        stock_status
      `)
      .eq("store_id", storeId)
      .order("name"),

    supabase
      .from("inventory_movements")
      .select(`
        id,
        type,
        quantity_delta,
        reason,
        created_at,
        item:items!inventory_movements_item_id_fkey (
          name,
          brand
        ),
        author:profiles!inventory_movements_created_by_fkey (
          full_name
        )
      `)
      .eq("store_id", storeId)
      .gte("created_at", movementsSince)
      .order("created_at", { ascending: false }),

    supabase
      .from("sales")
      .select(`
        id,
        created_at,
        total_amount,
        sale_items (
          quantity,
          line_total,
          line_cost,
          gross_margin,
          item:items (
            id,
            name,
            brand,
            category:categories (
              id,
              name
            )
          )
        )
      `)
      .eq("store_id", storeId)
      .eq("status", "completed")
      .gte("created_at", salesHistorySince),

    supabase
      .from("inventory_movements")
      .select(`
        quantity_delta,
        created_at,
        item:items!inventory_movements_item_id_fkey (
          id,
          name,
          brand,
          unit_cost
        )
      `)
      .eq("store_id", storeId)
      .eq("type", "perte")
      .gte("created_at", salesHistorySince),

    supabase
      .from("items")
      .select("id, created_at")
      .eq("store_id", storeId)
      .eq("active", true),
  ]);

  if (stockResponse.error) {
    throw new Error(
      `Impossible de charger les stocks : ${stockResponse.error.message}`,
    );
  }

  if (movementResponse.error) {
    throw new Error(
      `Impossible de charger les mouvements : ${movementResponse.error.message}`,
    );
  }

  if (salesResponse.error) {
    throw new Error(
      `Impossible de charger le chiffre d’affaires : ${salesResponse.error.message}`,
    );
  }

  if (lossesResponse.error) {
    throw new Error(
      `Impossible de charger les pertes : ${lossesResponse.error.message}`,
    );
  }

  if (itemMetadataResponse.error) {
    throw new Error(
      `Impossible de charger l’ancienneté des articles : ${itemMetadataResponse.error.message}`,
    );
  }

  const stockItems = (stockResponse.data ?? []) as StockRow[];

  const movements = (
    movementResponse.data ?? []
  ) as unknown as MovementRow[];
  const sales = (salesResponse.data ?? []) as unknown as ProfitabilitySale[];
  const losses = (lossesResponse.data ?? []) as unknown as ProfitabilityLoss[];
  const itemMetadata = (itemMetadataResponse.data ?? []) as ItemMetadataRow[];
  const profitability = calculateProfitability(
    sales,
    losses,
    performanceSince,
  );

  /*
   * Calcul des indicateurs.
   */
  const stockValue = stockItems.reduce(
    (total, item) => total + Number(item.stock_cost_value),
    0,
  );

  const watchedItems = stockItems.filter(
    (item) => item.stock_status !== "ok",
  );

  const outOfStock = watchedItems.filter(
    (item) => item.stock_status === "rupture",
  );
  const lowStock = watchedItems.filter(
    (item) => item.stock_status === "surveillance",
  );
  const lastSaleByItem = new Map<string, string>();

  for (const sale of sales) {
    for (const line of sale.sale_items) {
      if (!line.item) continue;
      const previous = lastSaleByItem.get(line.item.id);
      if (!previous || sale.created_at > previous) {
        lastSaleByItem.set(line.item.id, sale.created_at);
      }
    }
  }

  const createdAtByItem = new Map(
    itemMetadata.map((item) => [item.id, item.created_at]),
  );
  const dormantItems = stockItems.filter((item) => {
    if (Number(item.quantity) <= 0) return false;
    const createdAt = createdAtByItem.get(item.item_id);
    const lastSale = lastSaleByItem.get(item.item_id);
    return (
      Boolean(createdAt && createdAt < dormantSince) &&
      (!lastSale || lastSale < dormantSince)
    );
  });
  const abnormalLossThreshold = profitability.revenue * 0.05;
  const abnormalLosses = Array.from(
    profitability.losses
      .reduce((grouped, loss) => {
        if (!loss.item) return grouped;
        const current = grouped.get(loss.item.id) ?? {
          itemId: loss.item.id,
          name: getProductName(loss.item.name, loss.item.brand),
          units: 0,
          cost: 0,
        };
        const quantity = Math.abs(Number(loss.quantity_delta));
        current.units += quantity;
        current.cost += quantity * Number(loss.item.unit_cost);
        grouped.set(loss.item.id, current);
        return grouped;
      }, new Map<string, { itemId: string; name: string; units: number; cost: number }>())
      .values(),
  )
    .filter(
      (loss) =>
        loss.units >= 3 ||
        (profitability.revenue > 0 &&
          loss.cost >= abnormalLossThreshold),
    )
    .sort((first, second) => second.cost - first.cost);
  const smartAlerts = [
    ...outOfStock.map((item) => ({
      id: `rupture-${item.item_id}`,
      name: getProductName(item.name, item.brand),
      label: "Rupture",
      detail: "Aucune unité disponible",
      tone: "danger" as const,
      href: `/stocks?item=${item.item_id}`,
    })),
    ...lowStock.map((item) => ({
      id: `faible-${item.item_id}`,
      name: getProductName(item.name, item.brand),
      label: "Stock faible",
      detail: `${Number(item.quantity)} ${item.unit} · seuil ${Number(item.threshold)}`,
      tone: "warning" as const,
      href: `/stocks?item=${item.item_id}`,
    })),
    ...abnormalLosses.map((loss) => ({
      id: `perte-${loss.itemId}`,
      name: loss.name,
      label: "Pertes anormales",
      detail: `${loss.units} unités · ${formatCurrency(loss.cost, currency)}`,
      tone: "danger" as const,
      href: "/movements?type=perte",
    })),
    ...dormantItems.map((item) => ({
      id: `dormant-${item.item_id}`,
      name: getProductName(item.name, item.brand),
      label: "Stock dormant",
      detail: "Aucune vente depuis au moins 30 jours",
      tone: "neutral" as const,
      href: `/stocks?item=${item.item_id}`,
    })),
  ];

  const commercialValue = stockItems
    .filter((item) => item.kind === "commercialise")
    .reduce(
      (total, item) => total + Number(item.stock_cost_value),
      0,
    );

  const commercialShare =
    stockValue > 0
      ? Math.round((commercialValue / stockValue) * 100)
      : 0;

  const recentMovements = movements.slice(0, 5);

  const todayLabel = capitalize(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date()),
  );

  return (
    <AppShell
      active="performance"
      storeName={storeName}
      userName={String(user.user_metadata?.full_name ?? "").trim() || user.email || "Gestionnaire"}
    >
      <PageHeading
        eyebrow={todayLabel}
        title="Performance"
        description={`Voici l’essentiel de l’activité de ${storeName} aujourd’hui.`}
        action={
          <Link
            href="/stocks?new=1"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgb(173_84_38_/_18%)] transition hover:bg-brand-strong"
          >
            <PackagePlus size={18} aria-hidden="true" />
            Ajouter un article
          </Link>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-[0.1em] text-foreground/45">
          Période
        </span>
        {[7, 30, 90].map((days) => (
          <Link
            key={days}
            href={`/?period=${days}`}
            className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm font-semibold transition ${
              periodDays === days
                ? "border-sidebar bg-sidebar text-white"
                : "border-border bg-surface hover:border-brand/40"
            }`}
          >
            {days} jours
          </Link>
        ))}
      </div>

      <section
        className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Indicateurs clés"
      >
        <MetricCard
          label={`Chiffre d’affaires · ${periodDays} j`}
          value={formatCurrency(profitability.revenue, currency)}
          detail={`${profitability.unitsSold} produit${profitability.unitsSold > 1 ? "s" : ""} vendu${profitability.unitsSold > 1 ? "s" : ""}`}
          icon={<Banknote size={18} />}
          tone="success"
        />

        <MetricCard
          label={`Marge brute · ${periodDays} j`}
          value={formatCurrency(profitability.grossMargin, currency)}
          detail="Chiffre d’affaires − coût d’achat"
          icon={<Coins size={18} />}
          tone="success"
        />

        <MetricCard
          label="Taux de marge"
          value={`${profitability.marginRate.toFixed(1)} %`}
          detail={`${formatCurrency(profitability.costOfGoods, currency)} de marchandises vendues`}
          icon={<Percent size={18} />}
          tone="brand"
        />

        <MetricCard
          label="Bénéfice stock estimé"
          value={formatCurrency(profitability.estimatedProfit, currency)}
          detail="Marge brute − pertes enregistrées"
          icon={<TrendingUp size={18} />}
          tone={profitability.estimatedProfit >= 0 ? "success" : "danger"}
        />

        <MetricCard
          label={`Pertes · ${periodDays} j`}
          value={formatCurrency(profitability.lossCost, currency)}
          detail={`${profitability.unitsLost} unité${profitability.unitsLost > 1 ? "s" : ""} perdue${profitability.unitsLost > 1 ? "s" : ""}`}
          icon={<TriangleAlert size={18} />}
          tone="danger"
        />

        <MetricCard
          label="Alertes intelligentes"
          value={String(smartAlerts.length)}
          detail={`${outOfStock.length} rupture${outOfStock.length > 1 ? "s" : ""} · ${dormantItems.length} dormant${dormantItems.length > 1 ? "s" : ""}`}
          icon={<CircleAlert size={18} />}
          tone="warning"
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <RankingCard
          title="Produits les plus rentables"
          description={`Classement par marge brute sur ${periodDays} jours`}
          items={profitability.products}
          currency={currency}
        />
        <RankingCard
          title="Catégories les plus rentables"
          description={`Contribution à la marge sur ${periodDays} jours`}
          items={profitability.categories}
          currency={currency}
        />
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Produits qui coûtent de l’argent
            </h2>
            <p className="mt-1 text-sm text-foreground/52">
              Prix de vente inférieur ou égal au coût d’achat
            </p>
          </div>
        </div>

        {profitability.products.filter((product) => product.margin <= 0).length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {profitability.products
              .filter((product) => product.margin <= 0)
              .slice(0, 6)
              .map((product) => (
              <article
                key={product.id}
                className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-muted/55 p-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
                  <ArrowDownRight size={17} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {product.name}
                  </p>
                  <p className="mt-1 text-xs text-foreground/48">
                    {product.quantity} unité{product.quantity > 1 ? "s" : ""}
                  </p>
                </div>
                <p className="ml-auto shrink-0 font-mono text-xs font-semibold text-danger">
                  {formatCurrency(product.margin, currency)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-surface-muted/45 px-4 py-8 text-center text-sm text-foreground/50">
            Aucun produit vendu à perte sur cette période.
          </p>
        )}
      </section>

      <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.85fr)]">
        {/* Alertes */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Alertes prioritaires
              </h2>

              <p className="mt-1 text-sm text-foreground/52">
                Ruptures, faibles niveaux, dormance et pertes inhabituelles
              </p>
            </div>

            <Link
              href="/stocks?filter=watch"
              className="text-sm font-semibold text-brand-strong hover:underline"
            >
              Tout voir
            </Link>
          </div>

          <div className="mt-5 divide-y divide-border">
            {smartAlerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      alert.tone === "danger"
                        ? "bg-danger"
                        : alert.tone === "warning"
                          ? "bg-warning"
                          : "bg-foreground/30"
                    }`}
                  />

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {alert.name}
                    </p>

                    <p className="mt-1 text-xs text-foreground/48">
                      {alert.detail}
                    </p>
                  </div>
                </div>

                <p
                  className={`text-sm font-semibold ${
                    alert.tone === "danger"
                      ? "text-danger"
                      : alert.tone === "warning"
                        ? "text-warning"
                        : "text-foreground/55"
                  }`}
                >
                  {alert.label}
                </p>

                <Link
                  href={alert.href}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-xs font-semibold hover:border-brand/40 hover:bg-brand/5"
                >
                  Examiner
                </Link>
              </div>
            ))}

            {smartAlerts.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-semibold text-success">
                  Aucun signal préoccupant
                </p>

                <p className="mt-2 text-sm text-foreground/48">
                  Stocks, rotation et pertes sont sous contrôle.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Répartition */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">
            Répartition du stock
          </h2>

          <p className="mt-1 text-sm text-foreground/52">
            Par usage
          </p>

          <div
            className="mx-auto mt-7 grid h-40 w-40 place-items-center rounded-full"
            style={{
              background: `conic-gradient(
                var(--brand) 0 ${commercialShare}%,
                var(--surface-muted) ${commercialShare}% 100%
              )`,
            }}
          >
            <div className="grid h-28 w-28 place-items-center rounded-full bg-surface text-center">
              <div>
                <p className="text-3xl font-semibold">
                  {commercialShare}%
                </p>

                <p className="mt-1 text-xs text-foreground/48">
                  commercialisé
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-3 text-sm">
            <Legend
              color="bg-brand"
              label="Stock commercialisé"
              value={formatCurrency(commercialValue, currency)}
            />

            <Legend
              color="bg-surface-muted ring-1 ring-border"
              label="Outils & consommables"
              value={formatCurrency(
                stockValue - commercialValue,
                currency,
              )}
            />
          </div>
        </div>
      </section>

      {/* Activité récente */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
        <div className="flex items-center justify-between px-5 py-5 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight">
            Activité récente
          </h2>

          <Link
            href="/movements"
            className="text-sm font-semibold text-brand-strong hover:underline"
          >
            Historique
          </Link>
        </div>

        {/* Mobile */}
        <div className="divide-y divide-border border-t border-border md:hidden">
          {recentMovements.map((movement) => {
            const quantity = Number(movement.quantity_delta);

            return (
              <article key={movement.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold leading-5">
                      {getProductName(
                        movement.item?.name ?? "Article",
                        movement.item?.brand ?? "",
                      )}
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-muted px-2 py-1 text-[0.65rem] font-semibold">
                        {movementLabels[movement.type]}
                      </span>

                      <span className="text-xs text-foreground/45">
                        {formatMovementDate(
                          movement.created_at,
                          timezone,
                        )}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 font-mono text-lg font-semibold ${
                      quantity > 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {quantity > 0 ? "+" : ""}
                    {quantity}
                  </span>
                </div>

                <p className="mt-3 text-xs text-foreground/50">
                  Effectué par{" "}
                  <span className="font-semibold text-foreground/70">
                    {movement.author?.full_name || "Utilisateur"}
                  </span>
                </p>
                {movement.type === "perte" && movement.reason ? (
                  <p className="mt-2 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">
                    Motif : {movement.reason}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>

        {/* Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y border-border bg-surface-muted/45 text-xs uppercase tracking-[0.08em] text-foreground/45">
              <tr>
                <th className="px-6 py-3 font-semibold">
                  Article
                </th>

                <th className="px-4 py-3 font-semibold">
                  Type
                </th>

                <th className="px-4 py-3 font-semibold">
                  Quantité
                </th>

                <th className="px-4 py-3 font-semibold">
                  Motif
                </th>

                <th className="px-4 py-3 font-semibold">
                  Par
                </th>

                <th className="px-6 py-3 font-semibold">
                  Heure
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {recentMovements.map((movement) => {
                const quantity = Number(movement.quantity_delta);

                return (
                  <tr key={movement.id}>
                    <td className="px-6 py-4 font-medium">
                      {getProductName(
                        movement.item?.name ?? "Article",
                        movement.item?.brand ?? "",
                      )}
                    </td>

                    <td className="px-4 py-4 text-foreground/60">
                      {movementLabels[movement.type]}
                    </td>

                    <td
                      className={`px-4 py-4 font-mono font-semibold ${
                        quantity > 0
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {quantity > 0 ? "+" : ""}
                      {quantity}
                    </td>

                    <td className="max-w-48 px-4 py-4 text-foreground/55">
                      {movement.reason ?? "—"}
                    </td>

                    <td className="px-4 py-4 text-foreground/60">
                      {movement.author?.full_name || "Utilisateur"}
                    </td>

                    <td className="px-6 py-4 text-foreground/48">
                      {formatMovementDate(
                        movement.created_at,
                        timezone,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {recentMovements.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-semibold">
              Aucun mouvement enregistré
            </p>

            <p className="mt-2 text-sm text-foreground/48">
              Les prochaines ventes et mises à jour apparaîtront ici.
            </p>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "success" | "warning" | "brand" | "danger";
}) {
  const tones = {
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    brand: "bg-brand/10 text-brand-strong",
    danger: "bg-danger/10 text-danger",
  };

  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground/58">
          {label}
        </p>

        <span
          className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
        {value}
      </p>

      <p
        className={`mt-4 flex items-center gap-1.5 text-xs font-semibold ${
          tone === "success"
            ? "text-success"
            : tone === "warning"
              ? "text-warning"
              : tone === "danger"
                ? "text-danger"
              : "text-foreground/50"
        }`}
      >
        {tone === "success" ? (
          <ArrowUpRight size={14} />
        ) : tone === "warning" ? (
          <ArrowDownRight size={14} />
        ) : null}

        {detail}
      </p>
    </article>
  );
}

function RankingCard({
  title,
  description,
  items,
  currency,
}: {
  title: string;
  description: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    margin: number;
    marginRate: number;
  }>;
  currency: string;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-foreground/52">{description}</p>

      {items.length ? (
        <ol className="mt-5 space-y-3">
          {items.slice(0, 5).map((item, index) => (
            <li
              key={item.id}
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-surface-muted/55 p-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar text-xs font-semibold text-white">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-foreground/48">
                  {item.quantity} unité{item.quantity > 1 ? "s" : ""} ·{" "}
                  {item.marginRate.toFixed(1)} %
                </p>
              </div>
              <p
                className={`shrink-0 font-mono text-xs font-semibold ${
                  item.margin >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatCurrency(item.margin, currency)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-xl bg-surface-muted/45 px-4 py-8 text-center text-sm text-foreground/50">
          Aucune vente sur cette période.
        </p>
      )}
    </section>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />

      <span className="text-foreground/58">
        {label}
      </span>

      <span className="ml-auto font-mono text-xs font-semibold">
        {value}
      </span>
    </div>
  );
}

function getProductName(name: string, brand: string) {
  if (!brand) {
    return name;
  }

  if (name.toLowerCase().includes(brand.toLowerCase())) {
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
