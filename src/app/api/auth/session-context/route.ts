import { NextResponse } from "next/server";
import {
  ACCOUNT_SESSION_COOKIE,
  AccountDisabledError,
  accountSessionAllowsPath,
  accountSessionCookieOptions,
  createAccountSessionToken,
  getDefaultAccountDestination,
  loadAccountSessionContext,
} from "@/lib/account-session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const result = await createSessionResponse();

  if (!result.ok) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", result.error);
    return NextResponse.redirect(loginUrl);
  }

  const requestedDestination = safeDestination(
    requestUrl.searchParams.get("next"),
  );
  const destination =
    requestedDestination &&
    accountSessionAllowsPath(result.context, requestedDestination)
      ? requestedDestination
      : getDefaultAccountDestination(result.context);
  const response = NextResponse.redirect(
    new URL(destination, requestUrl.origin),
  );
  response.cookies.set(
    ACCOUNT_SESSION_COOKIE,
    result.token,
    accountSessionCookieOptions,
  );
  return response;
}

export async function POST() {
  const result = await createSessionResponse();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const response = NextResponse.json({
    context: result.context,
    destination: getDefaultAccountDestination(result.context),
  });
  response.cookies.set(
    ACCOUNT_SESSION_COOKIE,
    result.token,
    accountSessionCookieOptions,
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ACCOUNT_SESSION_COOKIE, "", {
    ...accountSessionCookieOptions,
    maxAge: 0,
  });
  return response;
}

async function createSessionResponse() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase n’est pas configuré.",
      status: 503,
    } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "La session utilisateur est introuvable.",
      status: 401,
    } as const;
  }

  try {
    const accountReader = getSupabaseAdminClient() ?? supabase;
    const context = await loadAccountSessionContext(accountReader, user.id);

    if (!context) {
      return {
        ok: false,
        error: "Aucun compte actif n’est associé à cet utilisateur.",
        status: 403,
      } as const;
    }

    return {
      ok: true,
      context,
      token: await createAccountSessionToken(context),
    } as const;
  } catch (error) {
    if (error instanceof AccountDisabledError) {
      return {
        ok: false,
        error: error.message,
        status: 403,
      } as const;
    }

    return {
      ok: false,
      error: "Impossible de charger la configuration du compte.",
      status: 500,
    } as const;
  }
}

function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
