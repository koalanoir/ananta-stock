import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { StockItem } from "@/lib/types";

export type CreateStockItemInput = Omit<StockItem, "id"> & {
  sellingPrice: number;
};

export async function createStockItem(
  storeId: string,
  input: CreateStockItemInput,
) {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase n’est pas configuré.");
  }

  const { data, error } = await supabase.rpc("create_stock_item", {
    target_store_id: storeId,
    category_name: input.category,
    product_name: input.name,
    brand_name: input.brand,
    stock_kind: input.kind,
    unit_name: input.unit,
    initial_quantity: input.quantity,
    alert_threshold: input.threshold,
    item_unit_cost: input.unitCost,
    item_selling_price: input.sellingPrice,
    request_id: crypto.randomUUID(),
  });

  if (error) {
    throw error;
  }

  return data;
}
