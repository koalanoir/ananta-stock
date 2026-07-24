import type { MovementType } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function recordStockMovement(
  itemId: string,
  type: Exclude<MovementType, "vente">,
  quantity: number,
  reason = "",
) {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase n’est pas configuré.");
  }

  const { data, error } = await supabase.rpc(
    "record_inventory_movement",
    {
      target_item_id: itemId,
      movement: type,
      quantity_value: quantity,
      movement_reason: reason,
      request_id: crypto.randomUUID(),
    },
  );

  if (error) {
    throw error;
  }

  return data;
}