import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SalesClient, type SaleItem } from "./sales-client";

export const dynamic = "force-dynamic";

type Membership = {
  organization_id: string;
  store_id: string | null;
  role: "owner" | "manager" | "seller";
};

type StoreRow = {
  name: string;
};

type ItemRow = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  category: { name: string } | null;
  stock: { quantity: number } | null;
};

export default async function SalesPage() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    throw new Error(
      "Supabase n’est pas configuré. Vérifie NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, store_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      `Impossible de charger le compte utilisateur : ${membershipError.message}`,
    );
  }

  const membership = membershipData as Membership | null;

  if (!membership) {
    redirect("/onboarding");
  }

  // L’écran Vente est réservé aux vendeurs.
  if (membership.role !== "seller") {
    redirect("/");
  }

  if (!membership.store_id) {
    throw new Error("Aucune boutique n’est associée à ce vendeur.");
  }

  const { data: storeData, error: storeError } = await supabase
    .from("stores")
    .select("name")
    .eq("id", membership.store_id)
    .single();

  if (storeError) {
    throw new Error(`Impossible de charger la boutique : ${storeError.message}`);
  }

  const { data, error } = await supabase
    .from("items")
    .select(`
      id,
      name,
      brand,
      unit,
      category:categories(name),
      stock:stock_levels(quantity)
    `)
    .eq("organization_id", membership.organization_id)
    .eq("store_id", membership.store_id)
    .eq("kind", "commercialise")
    .eq("active", true)
    .order("name");

  if (error) {
    throw new Error(`Impossible de charger les produits : ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ItemRow[];

  const items: SaleItem[] = rows.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category?.name ?? "Sans catégorie",
    unit: item.unit,
    quantity: Number(item.stock?.quantity ?? 0),
  }));

  const store = storeData as StoreRow;
  const userName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    String(user.user_metadata?.username ?? "").trim() ||
    "Vendeur";

  return (
    <SalesClient
      initialItems={items}
      storeName={store.name}
      userName={userName}
    />
  );
}
