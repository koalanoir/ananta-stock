"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  CookingPot,
  History,
  ListChecks,
  MonitorSmartphone,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import type { UserRole } from "@/lib/types";
import { SessionControls } from "@/components/session-controls";
import { getCurrentMembership } from "@/lib/data/current-user";
import {
  DEFAULT_FEATURE_FLAGS,
  normalizeFeatureFlags,
} from "@/lib/account-features";

type BusinessType = "retail" | "restaurant";

type AppShellProps = {
  active:
    | "performance"
    | "sales"
    | "stocks"
    | "movements"
    | "invoices"
    | "customers"
    | "orders"
    | "menu"
    | "pos"
    | "restaurant-orders"
    | "settings";
  role?: UserRole;
  storeName?: string;
  userName?: string;
  businessType?: BusinessType;
  children: React.ReactNode;
};

const managerNavigation = [
  { key: "performance", label: "Performance", mobileLabel: "Stats", href: "/", icon: BarChart3, audience: "all", feature: "performance" },
  { key: "stocks", label: "Stocks", href: "/stocks", icon: Boxes, audience: "all", feature: "stocks" },
  { key: "movements", label: "Mouvements", mobileLabel: "Mouv.", href: "/movements", icon: History, audience: "all", feature: "movements" },
  { key: "pos", label: "Caisse", href: "/pos", icon: MonitorSmartphone, audience: "restaurant", feature: "restaurant_pos" },
  { key: "restaurant-orders", label: "Commandes clients", mobileLabel: "Clients", href: "/restaurant-orders", icon: ListChecks, audience: "restaurant", feature: "restaurant_orders" },
  { key: "menu", label: "Carte & recettes", mobileLabel: "Carte", href: "/menu", icon: CookingPot, audience: "restaurant", feature: "restaurant_menu" },
  { key: "invoices", label: "Paiements & tickets", mobileLabel: "Tickets", href: "/invoices", icon: ReceiptText, audience: "restaurant", feature: "invoices" },
  { key: "invoices", label: "Factures", href: "/invoices", icon: ReceiptText, audience: "retail", feature: "invoices" },
  { key: "customers", label: "Clients", href: "/customers", icon: Users, audience: "all", feature: "customers" },
  { key: "orders", label: "Commandes fournisseurs", mobileLabel: "Commandes", href: "/orders", icon: Truck, audience: "all", feature: "supplier_orders" },
  { key: "settings", label: "Paramètres", mobileLabel: "Params", href: "/settings", icon: Settings, audience: "all", feature: null },
] as const;

const sellerNavigation = [
  { key: "sales", label: "Ventes rapides", mobileLabel: "Ventes", href: "/sales", icon: ShoppingCart, audience: "retail", feature: "sales" },
  { key: "pos", label: "Caisse restaurant", mobileLabel: "Caisse", href: "/pos", icon: MonitorSmartphone, audience: "restaurant", feature: "restaurant_pos" },
  { key: "restaurant-orders", label: "Commandes clients", mobileLabel: "Commandes", href: "/restaurant-orders", icon: ListChecks, audience: "restaurant", feature: "restaurant_orders" },
  { key: "invoices", label: "Mes tickets", mobileLabel: "Tickets", href: "/invoices", icon: ReceiptText, audience: "all", feature: "invoices" },
  { key: "stocks", label: "Comptage rapide", mobileLabel: "Comptage", href: "/count", icon: ClipboardCheck, audience: "all", feature: "stock_count" },
  { key: "movements", label: "Mes mouvements", mobileLabel: "Mouv.", href: "/movements", icon: History, audience: "all", feature: "movements" },
  { key: "orders", label: "Réceptions", href: "/orders", icon: Truck, audience: "all", feature: "supplier_orders" },
] as const;

export function AppShell({ active, role = "manager", storeName = "Ma boutique", userName = "Utilisateur", businessType, children }: AppShellProps) {
  const isSeller = role === "seller";
  const [detectedBusinessType, setDetectedBusinessType] =
    useState<BusinessType>("retail");
  const [featureFlags, setFeatureFlags] = useState(DEFAULT_FEATURE_FLAGS);
  const resolvedBusinessType = businessType ?? detectedBusinessType;

  useEffect(() => {
    if (businessType) return;

    let mounted = true;
    void getCurrentMembership()
      .then((membership) => {
        const store = membership.stores as { business_type?: string } | null;
        const organization = membership.organizations as {
          account_settings?: { feature_flags?: unknown } | null;
        } | null;
        if (mounted) {
          setDetectedBusinessType(
            store?.business_type === "restaurant" ? "restaurant" : "retail",
          );
          setFeatureFlags(
            normalizeFeatureFlags(
              organization?.account_settings?.feature_flags,
            ),
          );
        }
      })
      .catch(() => {
        if (mounted) setDetectedBusinessType("retail");
      });

    return () => {
      mounted = false;
    };
  }, [businessType]);

  const navigation = (isSeller ? sellerNavigation : managerNavigation).filter(
    (item) =>
      (item.audience === "all" || item.audience === resolvedBusinessType) &&
      (item.feature === null || featureFlags[item.feature]),
  );
  return (
    <div className="min-h-screen overflow-x-clip lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="sticky top-0 hidden h-screen self-start flex-col overflow-y-auto bg-sidebar px-4 py-6 text-white lg:flex">
        <Link href="/" className="px-3" aria-label="Accueil Ananta Stock">
          <span className="block text-[1.75rem] font-bold tracking-[0.13em]">ANANTA</span>
          <span className="mt-0.5 block text-[0.68rem] tracking-[0.42em] text-[#e9b18d]">STOCK</span>
        </Link>

        <nav className="mt-12 space-y-2" aria-label="Navigation principale">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/12 text-white" : "text-white/68 hover:bg-white/7 hover:text-white"
                }`}
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/6 p-3">
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-white/48">BOUTIQUE</p>
          <p className="mt-2 truncate text-sm font-semibold" title={storeName}>{storeName}</p>
          <p className="mt-1 truncate text-xs text-white/55" title={userName}>{userName} · {isSeller ? "Vendeur" : "Gestionnaire"}</p>
          <SessionControls role={role} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-surface/92 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="font-bold tracking-[0.12em]">ANANTA <span className="text-brand">STOCK</span></Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-[34vw] truncate rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium">{storeName}</span>
            <SessionControls role={role} compact />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 pb-24 sm:px-7 lg:px-10 lg:py-10 lg:pb-10">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 w-screen max-w-full overflow-x-auto border-t border-border bg-surface/96 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgb(35_55_46_/_8%)] backdrop-blur lg:hidden" aria-label="Navigation mobile">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <Link key={item.key} href={item.href} title={item.label} className={`flex min-h-12 min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[0.58rem] font-medium sm:text-[0.66rem] ${isActive ? "text-brand-strong" : "text-foreground/55"}`}>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} aria-hidden="true" />
                <span className="max-w-full truncate">
                  {"mobileLabel" in item ? item.mobileLabel : item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/58 sm:text-base">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function SettingsLink() {
  return (
    <Link href="#settings" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold shadow-sm transition hover:border-foreground/20">
      <Settings size={17} aria-hidden="true" /> Réglages
    </Link>
  );
}
