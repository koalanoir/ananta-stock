import Link from "next/link";
import { BarChart3, Boxes, ClipboardCheck, History, Settings } from "lucide-react";

type AppShellProps = {
  active: "dashboard" | "stocks" | "movements" | "count";
  children: React.ReactNode;
};

const navigation = [
  { key: "dashboard", label: "Vue d’ensemble", href: "/", icon: BarChart3 },
  { key: "stocks", label: "Stocks", href: "/stocks", icon: Boxes },
  { key: "movements", label: "Mouvements", href: "/movements", icon: History },
  { key: "count", label: "Comptage", href: "/count", icon: ClipboardCheck },
] as const;

export function AppShell({ active, children }: AppShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-sidebar px-4 py-6 text-white lg:flex">
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
          <p className="mt-2 text-sm font-semibold">Marché Central</p>
          <p className="mt-1 text-xs text-white/55">Dorian · Propriétaire</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-surface/92 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="font-bold tracking-[0.12em]">ANANTA <span className="text-brand">STOCK</span></Link>
          <span className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium">Marché Central</span>
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 pb-24 sm:px-7 lg:px-10 lg:py-10 lg:pb-10">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Navigation mobile">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <Link key={item.key} href={item.href} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[0.66rem] font-medium ${isActive ? "text-brand-strong" : "text-foreground/55"}`}>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} aria-hidden="true" />
                {item.label === "Vue d’ensemble" ? "Accueil" : item.label}
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
