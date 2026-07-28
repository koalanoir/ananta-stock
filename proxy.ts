import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PLATFORM_ADMIN_COOKIE,
  verifyPlatformAdminToken,
} from "@/lib/platform-admin-auth";
import {
  normalizeFeatureFlags,
  ROUTE_FEATURES,
} from "@/lib/account-features";

const publicRoutes = [
  "/login",
  "/register",
  "/auth/callback",
  "/api/auth/seller-login",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  const isAdminLogin =
    pathname === "/admin/login" ||
    pathname === "/api/platform-admin/session";
  const isAdminArea =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/platform-admin/");

  if (isAdminArea && !isAdminLogin) {
    const isAdmin = await verifyPlatformAdminToken(
      request.cookies.get(PLATFORM_ADMIN_COOKIE)?.value,
    );

    if (!isAdmin) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Session administrateur requise." },
          { status: 401 },
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  if (isAdminLogin) return response;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(
            ({ name, value, options }) => {
              response.cookies.set(
                name,
                value,
                options,
              );
            },
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = publicRoutes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`),
  );

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();

    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`,
    );

    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    const routeFeature =
      (pathname.startsWith("/api/invoices") ? "invoices" : undefined) ??
      Object.entries(ROUTE_FEATURES).find(
        ([route]) =>
          route === "/"
            ? pathname === "/"
            : pathname === route || pathname.startsWith(`${route}/`),
      )?.[1];

    if (routeFeature) {
      const { data: membership } = await supabase
        .from("memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (membership) {
        const { data: settings } = await supabase
          .from("account_settings")
          .select("feature_flags")
          .eq("organization_id", membership.organization_id)
          .maybeSingle();

        const flags = normalizeFeatureFlags(settings?.feature_flags);
        if (!flags[routeFeature]) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              { error: "Cette fonctionnalité est désactivée pour ce compte." },
              { status: 403 },
            );
          }
          const disabledUrl = request.nextUrl.clone();
          disabledUrl.pathname = "/feature-disabled";
          disabledUrl.search = "";
          disabledUrl.searchParams.set("feature", routeFeature);
          return NextResponse.redirect(disabledUrl);
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
