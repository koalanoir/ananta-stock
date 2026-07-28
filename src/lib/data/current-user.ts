import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getCurrentMembership() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase n’est pas configuré.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Utilisateur non connecté.");
  }

  const { data, error } = await supabase
    .from("memberships")
    .select(`
      organization_id,
      store_id,
      role,
      active,
      organizations (
        name,
        account_settings (
          feature_flags
        )
      ),
      stores (
        name,
        currency,
        timezone,
        business_type
      )
    `)
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Aucun commerce associé à cet utilisateur.");
  }

  return {
    ...data,
    user,
  };
}
