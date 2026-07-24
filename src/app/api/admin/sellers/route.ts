import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateSellerBody = {
  storeId?: string;
  fullName?: string;
  username?: string;
  pin?: string;
};

export async function POST(request: Request) {
  const supabase =
    await getSupabaseServerClient();

  const admin =
    getSupabaseAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json(
      {
        error:
          "La configuration Supabase est incomplète.",
      },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise." },
      { status: 401 },
    );
  }

  let body: CreateSellerBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requête invalide." },
      { status: 400 },
    );
  }

  const storeId = body.storeId?.trim();
  const fullName = body.fullName?.trim();
  const username =
    body.username?.trim().toLowerCase();
  const pin = body.pin?.trim();

  if (!storeId || !fullName || !username || !pin) {
    return NextResponse.json(
      {
        error:
          "Le nom, l’identifiant, le PIN et la boutique sont obligatoires.",
      },
      { status: 400 },
    );
  }

  if (fullName.length < 2 || fullName.length > 120) {
    return NextResponse.json(
      { error: "Le nom complet est invalide." },
      { status: 400 },
    );
  }

  if (
    !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(
      username,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "L’identifiant doit contenir entre 3 et 30 caractères : lettres minuscules, chiffres, point, tiret ou underscore.",
      },
      { status: 400 },
    );
  }

  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      {
        error:
          "Le code PIN doit contenir exactement 6 chiffres.",
      },
      { status: 400 },
    );
  }

  /*
   * Cette requête utilise le client du gestionnaire.
   * Les RLS vérifient qu’il a accès à la boutique.
   */
  const { data: store, error: storeError } =
    await supabase
      .from("stores")
      .select("id, organization_id, name")
      .eq("id", storeId)
      .eq("active", true)
      .maybeSingle();

  if (storeError || !store) {
    return NextResponse.json(
      {
        error:
          "Boutique introuvable ou inaccessible.",
      },
      { status: 404 },
    );
  }

  const { data: callerMembership } =
    await supabase
      .from("memberships")
      .select("role")
      .eq(
        "organization_id",
        store.organization_id,
      )
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager"])
      .maybeSingle();

  if (!callerMembership) {
    return NextResponse.json(
      {
        error:
          "Vous n’avez pas la permission de créer un vendeur.",
      },
      { status: 403 },
    );
  }

  /*
   * Vérification préalable pour produire un message lisible.
   * L’index SQL reste la protection définitive contre les doublons.
   */
  const { data: existingUsername } = await admin
    .from("memberships")
    .select("user_id")
    .eq("store_id", store.id)
    .ilike("username", username)
    .maybeSingle();

  if (existingUsername) {
    return NextResponse.json(
      {
        error:
          "Ce nom d’utilisateur est déjà utilisé dans cette boutique.",
      },
      { status: 409 },
    );
  }

  /*
   * Supabase Auth exige un e-mail ou un téléphone pour
   * l’authentification par mot de passe.
   *
   * Cette adresse est purement technique et n’est jamais
   * présentée au vendeur.
   */
  const technicalEmail =
    `${username}.${store.id.replaceAll("-", "")}` +
    "@seller.ananta-stock.app";

  const { data: createdUser, error: authError } =
    await admin.auth.admin.createUser({
      email: technicalEmail,
      password: pin,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        account_type: "seller",
        username,
        store_id: store.id,
        organization_id:
          store.organization_id,
      },
    });

  if (authError || !createdUser.user) {
    return NextResponse.json(
      {
        error:
          authError?.message ??
          "Le compte vendeur n’a pas pu être créé.",
      },
      { status: 400 },
    );
  }

  const sellerId = createdUser.user.id;

  /*
   * Le trigger handle_auth_user_profile crée déjà le profil.
   * On crée maintenant son rattachement à la boutique.
   */
  const { error: membershipError } = await admin
    .from("memberships")
    .insert({
      organization_id:
        store.organization_id,
      store_id: store.id,
      user_id: sellerId,
      role: "seller",
      username,
      active: true,
      login_enabled: true,
      created_by: user.id,
    });

  if (membershipError) {
    /*
     * Compensation : si le membership échoue,
     * on supprime le compte Auth orphelin.
     */
    await admin.auth.admin.deleteUser(
      sellerId,
    );

    return NextResponse.json(
      {
        error:
          membershipError.code === "23505"
            ? "Ce nom d’utilisateur est déjà utilisé."
            : membershipError.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      seller: {
        id: sellerId,
        name: fullName,
        username,
        status: "Hors ligne",
        hours: "Aucun horaire aujourd’hui",
        sales: 0,
        unitsSold: 0,
        hoursWorked: 0,
      },
    },
    { status: 201 },
  );
}