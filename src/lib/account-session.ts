import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeFeatureFlags,
  ROUTE_FEATURES,
  type FeatureFlags,
} from "@/lib/account-features";
import type { UserRole } from "@/lib/types";

export const ACCOUNT_SESSION_COOKIE = "ananta_account_session";
const ACCOUNT_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

export type AccountSessionContext = {
  userId: string;
  organizationId: string;
  storeId: string;
  role: UserRole;
  businessType: "retail" | "restaurant";
  featureFlags: FeatureFlags;
  issuedAt: number;
  expiresAt: number;
};

export class AccountDisabledError extends Error {
  constructor() {
    super("Ce compte a été désactivé par l’administrateur de la plateforme.");
    this.name = "AccountDisabledError";
  }
}

type MembershipSnapshot = {
  organization_id: string;
  store_id: string | null;
  role: UserRole;
  stores:
    | { business_type?: string | null }
    | Array<{ business_type?: string | null }>
    | null;
  organizations:
    | {
        access_enabled?: boolean;
        account_settings:
          | { feature_flags?: unknown }
          | Array<{ feature_flags?: unknown }>
          | null;
      }
    | Array<{
        access_enabled?: boolean;
        account_settings:
          | { feature_flags?: unknown }
          | Array<{ feature_flags?: unknown }>
          | null;
      }>
    | null;
};

export async function loadAccountSessionContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountSessionContext | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select(`
      organization_id,
      store_id,
      role,
      stores (
        business_type
      ),
      organizations (
        access_enabled,
        account_settings (
          feature_flags
        )
      )
    `)
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const membership = data as unknown as MembershipSnapshot;
  let storeId = membership.store_id;
  let store = firstRelation(membership.stores);

  if (!storeId) {
    const { data: firstStore, error: storeError } = await supabase
      .from("stores")
      .select("id, business_type")
      .eq("organization_id", membership.organization_id)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (storeError) throw storeError;
    if (!firstStore) return null;

    storeId = firstStore.id;
    store = firstStore;
  }

  if (!storeId) return null;

  const organization = firstRelation(membership.organizations);

  if (organization?.access_enabled === false) {
    throw new AccountDisabledError();
  }

  const settings = firstRelation(organization?.account_settings ?? null);
  const now = Math.floor(Date.now() / 1000);

  return {
    userId,
    organizationId: membership.organization_id,
    storeId,
    role: membership.role,
    businessType:
      store?.business_type === "restaurant" ? "restaurant" : "retail",
    featureFlags: normalizeFeatureFlags(settings?.feature_flags),
    issuedAt: now,
    expiresAt: now + ACCOUNT_SESSION_DURATION_SECONDS,
  };
}

export async function createAccountSessionToken(
  context: AccountSessionContext,
) {
  const payload = encodeBase64Url(JSON.stringify(context));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function verifyAccountSessionToken(
  token: string | undefined,
): Promise<AccountSessionContext | null> {
  if (!token || !sessionSecret()) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = await sign(payload);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const context = JSON.parse(
      decodeBase64Url(payload),
    ) as AccountSessionContext;

    if (
      !context.userId ||
      !context.organizationId ||
      !context.storeId ||
      !["owner", "manager", "seller"].includes(context.role) ||
      !["retail", "restaurant"].includes(context.businessType) ||
      context.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      ...context,
      featureFlags: normalizeFeatureFlags(context.featureFlags),
    };
  } catch {
    return null;
  }
}

export function accountSessionAllowsPath(
  context: AccountSessionContext,
  path: string,
) {
  const pathname = path.split("?")[0] || "/";
  const restaurantOnly = [
    "/menu",
    "/pos",
    "/restaurant-orders",
  ].some(
    (route) =>
      pathname === route || pathname.startsWith(`${route}/`),
  );

  if (restaurantOnly && context.businessType !== "restaurant") {
    return false;
  }

  const feature = Object.entries(ROUTE_FEATURES).find(
    ([route]) =>
      route === "/"
        ? pathname === "/"
        : pathname === route || pathname.startsWith(`${route}/`),
  )?.[1];

  return !feature || context.featureFlags[feature];
}

export function getDefaultAccountDestination(
  context: AccountSessionContext,
) {
  const candidates =
    context.role === "seller"
      ? context.businessType === "restaurant"
        ? ["/pos", "/restaurant-orders", "/invoices", "/count", "/movements", "/orders"]
        : ["/sales", "/invoices", "/count", "/movements", "/orders"]
      : context.businessType === "restaurant"
        ? ["/", "/stocks", "/pos", "/restaurant-orders", "/menu", "/invoices", "/customers", "/orders", "/settings"]
        : ["/", "/stocks", "/movements", "/invoices", "/customers", "/orders", "/settings"];

  return (
    candidates.find((path) => accountSessionAllowsPath(context, path)) ??
    "/feature-disabled"
  );
}

export const accountSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ACCOUNT_SESSION_DURATION_SECONDS,
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sessionSecret() {
  return (
    process.env.ACCOUNT_SESSION_SECRET ??
    process.env.ADMIN_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  );
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return encodeBase64UrlBytes(new Uint8Array(signature));
}

function encodeBase64Url(value: string) {
  return encodeBase64UrlBytes(new TextEncoder().encode(value));
}

function encodeBase64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);

  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
