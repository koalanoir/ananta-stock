import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminDatabase } from "@/lib/supabase/admin-database.types";

let adminClient: SupabaseClient<AdminDatabase> | null = null;

export function getSupabaseAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  adminClient ??= createClient<AdminDatabase>(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  return adminClient;
}
