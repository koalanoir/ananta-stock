import { NextResponse } from "next/server";
import {
  createPlatformAdminToken,
  isPlatformAdminConfigured,
  platformAdminCookieOptions,
  PLATFORM_ADMIN_COOKIE,
  verifyPlatformAdminCredentials,
} from "@/lib/platform-admin-auth";

export async function POST(request: Request) {
  if (!isPlatformAdminConfigured()) {
    return NextResponse.json(
      { error: "Le compte administrateur n’est pas configuré." },
      { status: 503 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (
    !verifyPlatformAdminCredentials(
      body.username?.trim() ?? "",
      body.password ?? "",
    )
  ) {
    return NextResponse.json(
      { error: "Nom d’utilisateur ou mot de passe incorrect." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    PLATFORM_ADMIN_COOKIE,
    await createPlatformAdminToken(body.username!.trim()),
    platformAdminCookieOptions,
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(PLATFORM_ADMIN_COOKIE, "", {
    ...platformAdminCookieOptions,
    maxAge: 0,
  });
  return response;
}
