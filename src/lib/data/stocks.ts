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
      stock_status
    `)
    .eq("store_id", storeId)
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as StockOverviewRow[];
}
