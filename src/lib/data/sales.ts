import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function recordSale(
  itemId: string,
  quantity: number,
) {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase n’est pas configuré.");
  }

  const { data, error } = await supabase.rpc("record_sale", {
    target_item_id: itemId,
    quantity_sold: quantity,
    request_id: crypto.randomUUID(),
  });

  if (error) {
    throw error;
  }

  return data;
}