import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasPlatformAdminSession } from "@/lib/platform-admin-auth";
import { normalizeFeatureFlags } from "@/lib/account-features";

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

type UpdateAccountBody = {
  storeId?: string;
  businessType?: "retail" | "restaurant";
  maxSellers?: number;
  retainCustomerOrders?: boolean;
  retainInvoices?: boolean;
  featureFlags?: unknown;
  accessEnabled?: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await hasPlatformAdminSession())) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase Admin n’est pas configuré." },
      { status: 503 },
    );
  }

  const { organizationId } = await context.params;
  let body: UpdateAccountBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const maxSellers = Math.trunc(Number(body.maxSellers));
  if (
    !body.storeId ||
    !["retail", "restaurant"].includes(body.businessType ?? "") ||
    typeof body.accessEnabled !== "boolean" ||
    !Number.isFinite(maxSellers) ||
    maxSellers < 0 ||
    maxSellers > 500
  ) {
    return NextResponse.json(
      { error: "Les paramètres transmis sont invalides." },
      { status: 400 },
    );
  }

  const retainCustomerOrders = body.retainCustomerOrders !== false;
  const retainInvoices = body.retainInvoices !== false;
  const featureFlags = normalizeFeatureFlags(body.featureFlags);
  const accessEnabled = body.accessEnabled;

  if (!retainCustomerOrders) {
    featureFlags.restaurant_pos = false;
    featureFlags.restaurant_orders = false;
  }
  if (!retainInvoices) {
    featureFlags.invoices = false;
    featureFlags.restaurant_pos = false;
    featureFlags.restaurant_orders = false;
  }

  const { error: storeError } = await admin
    .from("stores")
    .update({ business_type: body.businessType })
    .eq("id", body.storeId)
    .eq("organization_id", organizationId);

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 400 });
  }

  const { error: organizationError } = await admin
    .from("organizations")
    .update({ access_enabled: accessEnabled })
    .eq("id", organizationId);

  if (organizationError) {
    return NextResponse.json(
      { error: organizationError.message },
      { status: 400 },
    );
  }

  const { error: settingsError } = await admin
    .from("account_settings")
    .upsert({
      organization_id: organizationId,
      max_sellers: maxSellers,
      retain_customer_orders: retainCustomerOrders,
      retain_invoices: retainInvoices,
      feature_flags: featureFlags,
    });

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 });
  }

  if (!retainInvoices) {
    const { error } = await admin
      .from("invoices")
      .delete()
      .eq("organization_id", organizationId);
    if (error) {
      return NextResponse.json(
        { error: `Paramètres enregistrés, mais purge des factures impossible : ${error.message}` },
        { status: 409 },
      );
    }
  }

  if (!retainCustomerOrders) {
    const { error } = await admin
      .from("customer_orders")
      .delete()
      .eq("organization_id", organizationId);
    if (error) {
      return NextResponse.json(
        { error: `Paramètres enregistrés, mais purge des commandes impossible : ${error.message}` },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({
    settings: {
      businessType: body.businessType,
      maxSellers,
      retainCustomerOrders,
      retainInvoices,
      featureFlags,
      accessEnabled,
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await hasPlatformAdminSession())) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase Admin n’est pas configuré." },
      { status: 503 },
    );
  }

  const { organizationId } = await context.params;
  const { data: memberships, error: membershipsError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (membershipsError) {
    return NextResponse.json(
      { error: membershipsError.message },
      { status: 400 },
    );
  }

  const { error: deleteError } = await admin.rpc(
    "delete_organization_cascade",
    { target_organization_id: organizationId },
  );

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const userCleanupWarnings: string[] = [];

  for (const membership of memberships ?? []) {
    const { count } = await admin
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", membership.user_id);

    if (!count) {
      const { error: authDeleteError } =
        await admin.auth.admin.deleteUser(membership.user_id);

      if (authDeleteError) {
        userCleanupWarnings.push(membership.user_id);
      }
    }
  }

  return NextResponse.json({
    success: true,
    userCleanupWarnings,
  });
}
