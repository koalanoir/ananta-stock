import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RestaurantOrdersClient } from "./restaurant-orders-client";
import type { RestaurantOrder } from "@/lib/restaurant";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RestaurantOrdersPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("memberships")
    .select("organization_id, store_id, role").eq("user_id", user.id)
    .eq("active", true).limit(1).maybeSingle();
  if (!membership) redirect("/login");
  let storeId = membership.store_id;
  if (!storeId) {
    const { data } = await supabase.from("stores").select("id")
      .eq("organization_id", membership.organization_id).eq("active", true)
      .order("created_at").limit(1).maybeSingle();
    storeId = data?.id ?? null;
  }
  if (!storeId) throw new Error("Aucun magasin actif.");
  const [storeResult, ordersResult] = await Promise.all([
    supabase.from("stores").select("name, currency").eq("id", storeId).single(),
    supabase.from("customer_orders").select(`
      id, order_number, table_reference, preparation_status, payment_status,
      invoice_id, created_at,
      creator:profiles!customer_orders_created_by_fkey(full_name),
      customer_order_items(
        id, menu_item_id, quantity, unit_price, line_total,
        menu_item:menu_items(name)
      )
    `).eq("store_id", storeId).order("created_at", { ascending: false }).limit(100),
  ]);
  const error = storeResult.error ?? ordersResult.error;
  if (error) throw new Error(`Impossible de charger les commandes clients : ${error.message}`);
  if (!storeResult.data) throw new Error("Magasin introuvable.");
  const orders = (ordersResult.data ?? []).map((order) => ({
    ...order,
    customer_order_items: (order.customer_order_items ?? []).map((line) => ({
      ...line, quantity: Number(line.quantity), unit_price: Number(line.unit_price),
      line_total: Number(line.line_total),
    })),
  })) as unknown as RestaurantOrder[];
  const userName = String(user.user_metadata?.full_name ?? user.user_metadata?.username ?? user.email ?? "Utilisateur");
  return <RestaurantOrdersClient role={membership.role as UserRole} storeId={storeId}
    storeName={storeResult.data.name} currency={storeResult.data.currency}
    userName={userName} initialOrders={orders}/>;
}
