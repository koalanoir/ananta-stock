import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  InvoicesClient,
  type BillingCustomer,
  type BillingProduct,
} from "./invoices-client";
import type { InvoiceDocument } from "@/lib/invoices";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type MembershipRow = {
  organization_id: string;
  store_id: string | null;
  role: UserRole;
  store: { name: string; currency: string } | null;
};

export default async function InvoicesPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase n’est pas configuré.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membershipData, error: membershipError } = await supabase
    .from("memberships")
    .select(`
      organization_id,
      store_id,
      role,
      store:stores(name, currency)
    `)
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membershipData) redirect("/login");
  const membership = membershipData as unknown as MembershipRow;
  if (!membership.store_id) throw new Error("Aucune boutique associée.");

  const [productsResult, customersResult, invoicesResult] = await Promise.all([
    supabase
      .from("items")
      .select(`
        id, name, brand, unit, selling_price,
        category:categories(name),
        stock:stock_levels(quantity)
      `)
      .eq("store_id", membership.store_id)
      .eq("kind", "commercialise")
      .eq("active", true)
      .order("name"),
    supabase
      .from("customers")
      .select("id, full_name, email, phone, notes, created_at")
      .eq("store_id", membership.store_id)
      .order("full_name"),
    supabase
      .from("invoices")
      .select(`
        id, invoice_number, total_amount, created_at, email_status,
        customer:customers(id, full_name, email, phone),
        seller:profiles!invoices_seller_id_fkey(full_name),
        invoice_items(item_id, description, quantity, unit_price, line_total)
      `)
      .eq("store_id", membership.store_id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const firstError =
    productsResult.error ?? customersResult.error ?? invoicesResult.error;
  if (firstError) {
    throw new Error(`Impossible de charger la facturation : ${firstError.message}`);
  }

  const products = (productsResult.data ?? []).map((row) => {
    const product = row as unknown as {
      id: string;
      name: string;
      brand: string;
      unit: string;
      selling_price: number | string;
      category: { name: string } | null;
      stock: { quantity: number | string } | null;
    };

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      price: Number(product.selling_price),
      quantity: Number(product.stock?.quantity ?? 0),
      category: product.category?.name ?? "Sans catégorie",
    } satisfies BillingProduct;
  });

  const customers = (customersResult.data ?? []).map((row) => ({
    ...(row as BillingCustomer),
    email: row.email || null,
    phone: row.phone || null,
    notes: row.notes || null,
  }));

  const invoices = (invoicesResult.data ?? []).map(normalizeInvoice);
  const userName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    String(user.user_metadata?.username ?? "").trim() ||
    user.email ||
    "Utilisateur";

  return (
    <InvoicesClient
      initialProducts={products}
      initialCustomers={customers}
      initialInvoices={invoices}
      storeId={membership.store_id}
      storeName={membership.store?.name ?? "Ma boutique"}
      currency={membership.store?.currency ?? "XAF"}
      userName={userName}
      role={membership.role}
    />
  );
}

function normalizeInvoice(row: unknown): InvoiceDocument {
  const invoice = row as InvoiceDocument;
  return {
    ...invoice,
    total_amount: Number(invoice.total_amount),
    invoice_items: (invoice.invoice_items ?? []).map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      line_total: Number(line.line_total),
    })),
  };
}

