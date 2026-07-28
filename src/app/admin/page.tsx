import { redirect } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasPlatformAdminSession } from "@/lib/platform-admin-auth";
import { normalizeFeatureFlags } from "@/lib/account-features";
import { AdminDashboardClient, type AdminAccount } from "./admin-dashboard-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await hasPlatformAdminSession())) redirect("/admin/login");
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase Admin n’est pas configuré.");

  const [organizationsResult, storesResult, settingsResult, membershipsResult] =
    await Promise.all([
      admin.from("organizations").select("id, name, subscription_status, access_enabled, created_at").order("created_at", { ascending: false }),
      admin.from("stores").select("id, organization_id, name, business_type, active").eq("active", true),
      admin.from("account_settings").select("organization_id, max_sellers, retain_customer_orders, retain_invoices, feature_flags"),
      admin.from("memberships").select("organization_id, user_id, role, active").eq("active", true),
    ]);

  const error =
    organizationsResult.error ??
    storesResult.error ??
    settingsResult.error ??
    membershipsResult.error;
  if (error) throw new Error(`Impossible de charger les comptes : ${error.message}`);

  const storesByOrganization = new Map(
    (storesResult.data ?? []).map((store) => [store.organization_id, store]),
  );
  const settingsByOrganization = new Map(
    (settingsResult.data ?? []).map((settings) => [settings.organization_id, settings]),
  );
  const memberships = membershipsResult.data ?? [];

  const accounts: AdminAccount[] = (organizationsResult.data ?? []).map((organization) => {
    const store = storesByOrganization.get(organization.id);
    const settings = settingsByOrganization.get(organization.id);
    return {
      id: organization.id,
      name: organization.name,
      subscriptionStatus: organization.subscription_status,
      accessEnabled: organization.access_enabled,
      createdAt: organization.created_at,
      storeId: store?.id ?? "",
      storeName: store?.name ?? "Aucune boutique",
      businessType: store?.business_type ?? "retail",
      maxSellers: settings?.max_sellers ?? 5,
      retainCustomerOrders: settings?.retain_customer_orders ?? true,
      retainInvoices: settings?.retain_invoices ?? true,
      featureFlags: normalizeFeatureFlags(settings?.feature_flags),
      sellerCount: memberships.filter((item) => item.organization_id === organization.id && item.role === "seller").length,
      memberCount: memberships.filter((item) => item.organization_id === organization.id).length,
    };
  });

  return <AdminDashboardClient initialAccounts={accounts} />;
}
