import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MenuClient, type Ingredient, type MenuEntry } from "./menu-client";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, store_id, role")
    .eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
  if (!membership) redirect("/login");
  if (membership.role === "seller") redirect("/restaurant-orders");

  let storeId = membership.store_id;
  if (!storeId) {
    const { data } = await supabase.from("stores").select("id")
      .eq("organization_id", membership.organization_id).eq("active", true)
      .order("created_at").limit(1).maybeSingle();
    storeId = data?.id ?? null;
  }
  if (!storeId) throw new Error("Aucun magasin actif.");

  const [storeResult, ingredientsResult, menuResult] = await Promise.all([
    supabase.from("stores").select("name, currency").eq("id", storeId).single(),
    supabase.from("items").select("id, name, brand, unit, stock:stock_levels(quantity)")
      .eq("store_id", storeId).eq("kind", "ingredient").eq("active", true).order("name"),
    supabase.from("menu_items").select(`
      id, name, description, type, selling_price, active,
      menu_item_ingredients(id, item_id, quantity_required)
    `).eq("store_id", storeId).eq("active", true).order("name"),
  ]);
  const error = storeResult.error ?? ingredientsResult.error ?? menuResult.error;
  if (error) throw new Error(`Impossible de charger la carte : ${error.message}`);
  if (!storeResult.data) throw new Error("Magasin introuvable.");

  const ingredients = (ingredientsResult.data ?? []).map((row) => ({
    id: row.id, name: row.name, brand: row.brand ?? "", unit: row.unit,
    quantity: Number((row.stock as unknown as { quantity: number } | null)?.quantity ?? 0),
  })) satisfies Ingredient[];
  const menu = (menuResult.data ?? []).map((row) => ({
    ...row,
    selling_price: Number(row.selling_price),
    menu_item_ingredients: (row.menu_item_ingredients ?? []).map((line) => ({
      ...line, quantity_required: Number(line.quantity_required),
    })),
  })) as MenuEntry[];
  const userName = String(user.user_metadata?.full_name ?? user.user_metadata?.username ?? user.email ?? "Utilisateur");

  return <MenuClient role={membership.role as UserRole} storeId={storeId}
    storeName={storeResult.data.name} currency={storeResult.data.currency}
    userName={userName} ingredients={ingredients} initialMenu={menu} />;
}
