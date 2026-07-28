import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code =
    requestUrl.searchParams.get("code");

  if (!code) {
    return redirectToLogin(
      requestUrl,
      "Le lien de confirmation est invalide.",
    );
  }

  const supabase =
    await getSupabaseServerClient();

  if (!supabase) {
    return redirectToLogin(
      requestUrl,
      "Supabase n’est pas configuré.",
    );
  }

  const { data, error } =
    await supabase.auth.exchangeCodeForSession(
      code,
    );

  if (error || !data.user) {
    return redirectToLogin(
      requestUrl,
      "Le lien de confirmation est invalide ou expiré.",
    );
  }

  /*
   * On vérifie que l’utilisateur n’appartient pas
   * déjà à une organisation.
   */
  const { data: existingMembership } =
    await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

  if (existingMembership) {
    const destination =
      existingMembership.role === "seller"
        ? "/sales"
        : "/";

    return NextResponse.redirect(
      new URL(destination, requestUrl.origin),
    );
  }

  const organizationName = String(
    data.user.user_metadata
      ?.organization_name ?? "",
  ).trim();

  const storeName = String(
    data.user.user_metadata?.store_name ?? "",
  ).trim();

  const accountType =
    data.user.user_metadata?.account_type;
  const businessType =
    data.user.user_metadata?.business_type === "restaurant"
      ? "restaurant"
      : "retail";

  if (
    accountType !== "owner" ||
    !organizationName ||
    !storeName
  ) {
    return redirectToLogin(
      requestUrl,
      "Les informations de l’organisation sont incomplètes.",
    );
  }

  const { error: organizationError } =
    await supabase.rpc(
      "create_organization",
      {
        organization_name: organizationName,
        store_name: storeName,
        selected_business_type: businessType,
      },
    );

  if (organizationError) {
    return redirectToLogin(
      requestUrl,
      `L’organisation n’a pas pu être créée : ${organizationError.message}`,
    );
  }

  return NextResponse.redirect(
    new URL(
      businessType === "restaurant" ? "/menu" : "/stocks",
      requestUrl.origin,
    ),
  );
}

function redirectToLogin(
  url: URL,
  message: string,
) {
  const destination = new URL(
    "/login",
    url.origin,
  );

  destination.searchParams.set(
    "error",
    message,
  );

  return NextResponse.redirect(destination);
}
