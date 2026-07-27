import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import {
  OrdersClient,
  type OrderNotification,
  type OrderProduct,
  type PurchaseOrderSummary,
} from "./orders-client";

export const dynamic = "force-dynamic";

type MembershipRow = {
  organization_id: string;
  store_id: string | null;
  role: UserRole;
};

type StoreRow = {
  id: string;
  name: string;
  currency: string;
};

export default async function OrdersPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase n’est pas configuré.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membershipData, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, store_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membershipData) redirect("/login");
  const membership = membershipData as MembershipRow;

  let storeId = membership.store_id;
  if (!storeId) {
    const { data } = await supabase
      .from("stores")
      .select("id")
      .eq("organization_id", membership.organization_id)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    storeId = data?.id ?? null;
  }
  if (!storeId) throw new Error("Aucune boutique active n’est disponible.");

  const [storeResult, productsResult, ordersResult, notificationsResult] =
    await Promise.all([
      supabase
        .from("stores")
        .select("id, name, currency")
        .eq("id", storeId)
        .single(),
      supabase
        .from("items")
        .select("id, name, brand, unit, unit_cost")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("purchase_orders")
        .select(`
          id, order_number, status, notes, expected_delivery_date,
          ordered_at, created_at,
          supplier:suppliers(id, name, email, phone),
          creator:profiles!purchase_orders_created_by_fkey(full_name),
          purchase_order_items(
            id, item_id, ordered_quantity, received_quantity, unit_cost_snapshot,
            item:items(id, name, brand, unit)
          )
        `)
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100),
      membership.role === "seller"
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("notifications")
            .select("id, title, message, purchase_order_id, read_at, created_at")
            .eq("store_id", storeId)
            .eq("recipient_id", user.id)
            .order("created_at", { ascending: false })
            .limit(30),
    ]);

  const firstError =
    storeResult.error ??
    productsResult.error ??
    ordersResult.error ??
    notificationsResult.error;
  if (firstError) {
    throw new Error(`Impossible de charger les commandes : ${firstError.message}`);
  }

  const store = storeResult.data as StoreRow;
  const products = (productsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand ?? "",
    unit: row.unit,
    unitCost: Number(row.unit_cost),
  })) satisfies OrderProduct[];

  const orders = (ordersResult.data ?? []).map(normalizeOrder);
  const notifications = (notificationsResult.data ??
    []) as unknown as OrderNotification[];
  const userName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    String(user.user_metadata?.username ?? "").trim() ||
    user.email ||
    "Utilisateur";

  return (
    <OrdersClient
      role={membership.role}
      storeId={store.id}
      storeName={store.name}
      currency={store.currency}
      userName={userName}
      products={products}
      initialOrders={orders}
      initialNotifications={notifications}
    />
  );
}

function normalizeOrder(row: unknown): PurchaseOrderSummary {
  const order = row as PurchaseOrderSummary;
  return {
    ...order,
    purchase_order_items: (order.purchase_order_items ?? []).map((line) => ({
      ...line,
      ordered_quantity: Number(line.ordered_quantity),
      received_quantity: Number(line.received_quantity),
      unit_cost_snapshot: Number(line.unit_cost_snapshot),
    })),
  };
}
