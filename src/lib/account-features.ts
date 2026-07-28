export const ACCOUNT_FEATURES = [
  { key: "performance", label: "Performance" },
  { key: "stocks", label: "Stocks" },
  { key: "movements", label: "Mouvements" },
  { key: "sales", label: "Ventes rapides" },
  { key: "invoices", label: "Factures et tickets" },
  { key: "customers", label: "Clients" },
  { key: "supplier_orders", label: "Commandes fournisseurs" },
  { key: "stock_count", label: "Comptage rapide" },
  { key: "restaurant_menu", label: "Carte et recettes" },
  { key: "restaurant_pos", label: "Caisse restaurant" },
  { key: "restaurant_orders", label: "Commandes clients restaurant" },
] as const;

export type AccountFeature = (typeof ACCOUNT_FEATURES)[number]["key"];
export type FeatureFlags = Record<AccountFeature, boolean>;

export const DEFAULT_FEATURE_FLAGS = Object.fromEntries(
  ACCOUNT_FEATURES.map(({ key }) => [key, true]),
) as FeatureFlags;

export const ROUTE_FEATURES: Record<string, AccountFeature> = {
  "/": "performance",
  "/stocks": "stocks",
  "/movements": "movements",
  "/sales": "sales",
  "/invoices": "invoices",
  "/customers": "customers",
  "/orders": "supplier_orders",
  "/count": "stock_count",
  "/menu": "restaurant_menu",
  "/pos": "restaurant_pos",
  "/restaurant-orders": "restaurant_orders",
};

export function normalizeFeatureFlags(value: unknown): FeatureFlags {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    ACCOUNT_FEATURES.map(({ key }) => [key, raw[key] !== false]),
  ) as FeatureFlags;
}
