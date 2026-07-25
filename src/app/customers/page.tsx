import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  CustomersClient,
  type CustomerSummary,
} from "./customers-client";

export const dynamic = "force-dynamic";

type MembershipRow = {
  organization_id: string;
  store_id: string | null;
  role: "owner" | "manager" | "seller";
  store: { name: string; currency: string } | null;
};

export default async function CustomersPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase n’est pas configuré.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membershipData } = await supabase
    .from("memberships")
    .select("organization_id, store_id, role, store:stores(name, currency)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!membershipData) redirect("/login");
  const membership = membershipData as unknown as MembershipRow;
  if (membership.role === "seller") redirect("/invoices");
  if (!membership.store_id) throw new Error("Aucune boutique associée.");

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id, full_name, email, phone, notes, created_at,
      invoices(id, invoice_number, total_amount, created_at, status)
    `)
    .eq("store_id", membership.store_id)
    .order("full_name");

  if (error) {
    throw new Error(`Impossible de charger les clients : ${error.message}`);
  }

  const customers = (data ?? []).map((row) => {
    const customer = row as unknown as CustomerSummary;
    return {
      ...customer,
      invoices: (customer.invoices ?? []).map((invoice) => ({
        ...invoice,
        total_amount: Number(invoice.total_amount),
      })),
    };
  });

  const userName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    user.email ||
    "Gestionnaire";

  return (
    <CustomersClient
      initialCustomers={customers}
      storeId={membership.store_id}
      storeName={membership.store?.name ?? "Ma boutique"}
      currency={membership.store?.currency ?? "XAF"}
      userName={userName}
      role={membership.role}
    />
  );
}
