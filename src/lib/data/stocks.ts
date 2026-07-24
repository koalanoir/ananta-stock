import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getStockItems(storeId: string) {
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

  return data ?? [];
}