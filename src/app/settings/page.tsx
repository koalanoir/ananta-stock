import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  SettingsClient,
  type SellerSummary,
} from "./settings-client";

type Membership = {
  organization_id: string;
  store_id: string | null;
  role: "owner" | "manager" | "seller";
};

type SellerMembershipRow = {
  user_id: string;
  username: string | null;
  active: boolean;
  profile: {
    full_name: string;
  } | null;
};

type WorkHoursRow = {
  user_id: string;
  first_arrival: string;
  last_departure: string | null;
  hours_worked: number;
};

type PerformanceRow = {
  seller_id: string;
  sales_count: number;
  units_sold: number;
};

type OpenSessionRow = {
  user_id: string;
  opened_at: string;
};

function dateInTimezone(
  timezone: string,
) {
  const parts =
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

  const year = parts.find(
    (part) => part.type === "year",
  )?.value;

  const month = parts.find(
    (part) => part.type === "month",
  )?.value;

  const day = parts.find(
    (part) => part.type === "day",
  )?.value;

  return `${year}-${month}-${day}`;
}

function formatTime(
  value: string | null,
  timezone: string,
) {
  if (!value) return null;

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export default async function SettingsPage() {
  const supabase =
    await getSupabaseServerClient();

  if (!supabase) {
    throw new Error(
      "Supabase n’est pas configuré. Vérifie les variables d’environnement.",
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: membershipData,
    error: membershipError,
  } = await supabase
    .from("memberships")
    .select(
      "organization_id, store_id, role",
    )
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager"])
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      `Impossible de charger votre accès : ${membershipError.message}`,
    );
  }

  const membership =
    membershipData as Membership | null;

  if (!membership) {
    redirect("/sales");
  }

  if (
    membership.role !== "owner" &&
    membership.role !== "manager"
  ) {
    redirect("/sales");
  }

  const administratorRole:
    | "owner"
    | "manager" =
    membership.role === "owner"
      ? "owner"
      : "manager";

  let storeId = membership.store_id;

  if (!storeId) {
    const {
      data: firstStore,
      error: firstStoreError,
    } = await supabase
      .from("stores")
      .select("id")
      .eq(
        "organization_id",
        membership.organization_id,
      )
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (firstStoreError) {
      throw new Error(
        `Impossible de charger la boutique : ${firstStoreError.message}`,
      );
    }

    storeId = firstStore?.id ?? null;
  }

  if (!storeId) {
    throw new Error(
      "Aucune boutique active n’est disponible.",
    );
  }

  const {
    data: storeData,
    error: storeError,
  } = await supabase
    .from("stores")
    .select("name, timezone")
    .eq("id", storeId)
    .single();

  if (storeError) {
    throw new Error(
      `Impossible de charger la boutique : ${storeError.message}`,
    );
  }

  const timezone =
    storeData.timezone ||
    "Africa/Brazzaville";

  const today =
    dateInTimezone(timezone);

  const [
    sellersResult,
    workHoursResult,
    performanceResult,
    openSessionsResult,
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select(`
        user_id,
        username,
        active,
        profile:profiles!memberships_user_id_fkey(
          full_name
        )
      `)
      .eq(
        "organization_id",
        membership.organization_id,
      )
      .eq("store_id", storeId)
      .eq("role", "seller")
      .eq("active", true),

    supabase
      .from("daily_work_hours")
      .select(`
        user_id,
        first_arrival,
        last_departure,
        hours_worked
      `)
      .eq(
        "organization_id",
        membership.organization_id,
      )
      .eq("store_id", storeId)
      .eq("work_date", today),

    supabase
      .from(
        "daily_seller_performance",
      )
      .select(`
        seller_id,
        sales_count,
        units_sold
      `)
      .eq(
        "organization_id",
        membership.organization_id,
      )
      .eq("store_id", storeId)
      .eq("sale_date", today),

    supabase
      .from("work_sessions")
      .select("user_id, opened_at")
      .eq(
        "organization_id",
        membership.organization_id,
      )
      .eq("store_id", storeId)
      .is("closed_at", null),
  ]);

  const firstError =
    sellersResult.error ??
    workHoursResult.error ??
    performanceResult.error ??
    openSessionsResult.error;

  if (firstError) {
    throw new Error(
      `Impossible de charger les statistiques : ${firstError.message}`,
    );
  }

  const sellerRows =
    (sellersResult.data ??
      []) as unknown as SellerMembershipRow[];

  const workRows =
    (workHoursResult.data ??
      []) as WorkHoursRow[];

  const performanceRows =
    (performanceResult.data ??
      []) as PerformanceRow[];

  const openRows =
    (openSessionsResult.data ??
      []) as OpenSessionRow[];

  const hoursByUser = new Map(
    workRows.map((row) => [
      row.user_id,
      row,
    ]),
  );

  const performanceByUser = new Map(
    performanceRows.map((row) => [
      row.seller_id,
      row,
    ]),
  );

  const openSessionsByUser = new Map(
    openRows.map((row) => [
      row.user_id,
      row,
    ]),
  );

  const sellers: SellerSummary[] =
    sellerRows.map((seller) => {
      const work =
        hoursByUser.get(
          seller.user_id,
        );

      const performance =
        performanceByUser.get(
          seller.user_id,
        );

      const openSession =
        openSessionsByUser.get(
          seller.user_id,
        );

      const arrival = formatTime(
        work?.first_arrival ??
          openSession?.opened_at ??
          null,
        timezone,
      );

      const departure = formatTime(
        work?.last_departure ?? null,
        timezone,
      );

      let hours =
        "Aucun horaire aujourd’hui";

      if (openSession && arrival) {
        hours = `${arrival} – maintenant`;
      } else if (
        arrival &&
        departure
      ) {
        hours =
          `${arrival} – ${departure}`;
      } else if (arrival) {
        hours = arrival;
      }

      return {
        id: seller.user_id,

        name:
          seller.profile?.full_name ||
          seller.username ||
          "Vendeur sans nom",

        username:
          seller.username ??
          "sans-identifiant",

        status: openSession
          ? "En poste"
          : "Hors ligne",

        hours,

        hoursWorked: Number(
          work?.hours_worked ?? 0,
        ),

        sales: Number(
          performance?.sales_count ??
            0,
        ),

        unitsSold: Number(
          performance?.units_sold ??
            0,
        ),
      };
    });

  return (
    <SettingsClient
      organizationId={
        membership.organization_id
      }
      storeId={storeId}
      storeName={storeData.name}
      role={administratorRole}
      initialSellers={sellers}
    />
  );
}