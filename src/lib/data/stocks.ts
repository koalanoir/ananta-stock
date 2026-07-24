import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type StockOverviewRow = {
  item_id: string;
  name: string;
  brand: string;
  kind: "commercialise" | "outil";
  unit: string;
  threshold: number | string;
  unit_cost: number | string;
  selling_price: number | string;
  quantity: number | string;
  stock_status: "ok" | "surveillance" | "rupture";
  category_name: string;
};

export async function getStockItems(storeId: string): Promise<StockOverviewRow[]> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase n’est pas configuré.");
  }

  const { data, error } = await supabase
    .from("stock_overview")
    .select(`
      item_id,
      name,
      brand,
      kind,
      unit,
      threshold,
      unit_cost,
      selling_price,
      quantity,
      stock_status,
      category_name
    `)
    .eq("store_id", storeId)
    .order("name");

  if (!error) {
    return (data ?? []) as StockOverviewRow[];
  }

  // Compatibilité avec les projets où la vue stock_overview n’a pas encore
  // reçu category_name : les tables sources restent la référence.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("items")
    .select(`
      id,
      name,
      brand,
      kind,
      unit,
      threshold,
      unit_cost,
      selling_price,
      category:categories(name),
      stock:stock_levels(quantity)
    `)
    .eq("store_id", storeId)
    .eq("active", true)
    .order("name");

  if (fallbackError) {
    throw fallbackError;
  }

  return ((fallbackData ?? []) as unknown as Array<{
    id: string;
    name: string;
    brand: string;
    kind: "commercialise" | "outil";
    unit: string;
    threshold: number | string;
    unit_cost: number | string;
    selling_price: number | string;
    category: { name: string } | null;
    stock: { quantity: number | string } | null;
  }>).map((item) => {
    const quantity = Number(item.stock?.quantity ?? 0);
    const threshold = Number(item.threshold);

    return {
      item_id: item.id,
      name: item.name,
      brand: item.brand,
      kind: item.kind,
      unit: item.unit,
      threshold,
      unit_cost: item.unit_cost,
      selling_price: item.selling_price,
      quantity,
      stock_status:
        quantity <= 0
          ? "rupture"
          : quantity <= threshold
            ? "surveillance"
            : "ok",
      category_name: item.category?.name ?? "Sans catégorie",
    };
  });
}
