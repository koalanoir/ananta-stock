import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SellerLoginBody = {
  storeCode?: string;
  username?: string;
  pin?: string;
};

export async function POST(request: Request) {
  const admin =
    getSupabaseAdminClient();

  const supabase =
    await getSupabaseServerClient();

  if (!admin || !supabase) {
    return NextResponse.json(
      {
        error:
          "La configuration Supabase est incomplète.",
      },
      { status: 500 },
    );
  }

  let body: SellerLoginBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requête invalide." },
      { status: 400 },
    );
  }

  const storeCode =
    body.storeCode?.trim().toUpperCase();

  const username =
    body.username?.trim().toLowerCase();

  const pin = body.pin?.trim();

  if (!storeCode || !username || !pin) {
    return NextResponse.json(
      {
        error:
          "Le code boutique, l’identifiant et le PIN sont obligatoires.",
      },
      { status: 400 },
    );
  }

  /*
   * Le client Admin est nécessaire car l’utilisateur
   * n’est pas encore authentifié.
   */
  const { data: store } = await admin
    .from("stores")
    .select("id, organization_id")
    .ilike("login_code", storeCode)
    .eq("active", true)
    .maybeSingle();

  if (!store) {
    return invalidCredentials();
  }

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", store.organization_id)
    .eq("store_id", store.id)
    .eq("role", "seller")
    .eq("active", true)
    .eq("login_enabled", true)
    .ilike("username", username)
    .maybeSingle();

  if (!membership) {
    return invalidCredentials();
  }

  /*
   * Récupération de l’adresse technique.
   * Elle ne sera jamais envoyée au navigateur.
   */
  const { data: authUser, error: userError } =
    await admin.auth.admin.getUserById(
      membership.user_id,
    );

  const technicalEmail =
    authUser.user?.email;

  if (userError || !technicalEmail) {
    return invalidCredentials();
  }

  /*
   * Le client SSR crée la session dans les cookies
   * de la réponse Next.js.
   */
  const { error: signInError } =
    await supabase.auth.signInWithPassword({
      email: technicalEmail,
      password: pin,
    });

  if (signInError) {
    return invalidCredentials();
  }

  return NextResponse.json({
    success: true,
    destination: "/sales",
  });
}

function invalidCredentials() {
  /*
   * Toujours renvoyer le même message pour ne pas révéler
   * si la boutique ou l’utilisateur existe.
   */
  return NextResponse.json(
    {
      error:
        "Code boutique, identifiant ou PIN incorrect.",
    },
    { status: 401 },
  );
}