import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PosClient } from "./pos-client";
import type { MenuItemSummary } from "@/lib/restaurant";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PosPage() {
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
  const [storeResult, menuResult] = await Promise.all([
    supabase.from("stores").select("name, currency, business_type").eq("id", storeId).single(),
    supabase.from("menu_items").select("id, name, description, type, selling_price")
      .eq("store_id", storeId).eq("active", true).order("type").order("name"),
  ]);
  const error = storeResult.error ?? menuResult.error;
  if (error) throw new Error(`Impossible de charger la caisse : ${error.message}`);
  if (!storeResult.data) throw new Error("Magasin introuvable.");
  if (storeResult.data.business_type !== "restaurant") redirect("/stocks");
  const menu = (menuResult.data ?? []).map((item) => ({
    ...item, selling_price: Number(item.selling_price),
  })) as MenuItemSummary[];
  const userName = String(user.user_metadata?.full_name ?? user.user_metadata?.username ?? user.email ?? "Utilisateur");
  return <PosClient role={membership.role as UserRole} storeId={storeId}
    storeName={storeResult.data.name} currency={storeResult.data.currency}
    userName={userName} menu={menu}/>;
}
