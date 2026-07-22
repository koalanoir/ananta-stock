import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleAlert, PackagePlus, TrendingUp } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { demoItems, demoMovements } from "@/lib/demo-data";
import { formatCurrency, getStockStatus } from "@/lib/types";

const movementLabels = { entree: "Entrée", sortie: "Sortie", perte: "Perte", ajustement: "Ajustement" } as const;

export default function DashboardPage() {
  const stockValue = demoItems.reduce((total, item) => total + item.quantity * item.unitCost, 0);
  const watchedItems = demoItems.filter((item) => getStockStatus(item) !== "ok");
  const outOfStock = watchedItems.filter((item) => getStockStatus(item) === "rupture");
  const commercialValue = demoItems.filter((item) => item.kind === "commercialise").reduce((total, item) => total + item.quantity * item.unitCost, 0);
  const commercialShare = stockValue ? Math.round((commercialValue / stockValue) * 100) : 0;

  return (
    <AppShell active="dashboard">
      <PageHeading
        eyebrow="Mercredi 22 juillet"
        title="Bonjour Dorian,"
        description="Voici l’essentiel de vos stocks aujourd’hui. Les chiffres affichés sont des données de démonstration."
        action={
          <Link href="/stocks?new=1" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgb(173_84_38_/_18%)] transition hover:bg-brand-strong">
            <PackagePlus size={18} aria-hidden="true" /> Ajouter un article
          </Link>
        }
      />

      <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Indicateurs clés">
        <MetricCard label="Valeur du stock" value={formatCurrency(stockValue)} detail="+ 6,4 % ce mois" icon={<TrendingUp size={18} />} tone="success" />
        <MetricCard label="Articles à surveiller" value={String(watchedItems.length)} detail={`${outOfStock.length} en rupture`} icon={<CircleAlert size={18} />} tone="warning" />
        <MetricCard label="Mouvements aujourd’hui" value="38" detail="24 sorties · 14 entrées" icon={<ArrowUpRight size={18} />} tone="brand" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-xl font-semibold tracking-tight">Alertes prioritaires</h2><p className="mt-1 text-sm text-foreground/52">À traiter pour éviter une rupture</p></div>
            <Link href="/stocks?filter=watch" className="text-sm font-semibold text-brand-strong hover:underline">Tout voir</Link>
          </div>
          <div className="mt-5 divide-y divide-border">
            {watchedItems.slice(0, 3).map((item) => {
              const status = getStockStatus(item);
              return (
                <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === "rupture" ? "bg-danger" : "bg-warning"}`} />
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-foreground/48">{item.kind === "commercialise" ? "Stock commercialisé" : "Outils & consommables"}</p></div>
                  </div>
                  <p className={`text-sm font-semibold ${status === "rupture" ? "text-danger" : "text-warning"}`}>{item.quantity} {item.unit}{item.quantity > 1 ? "s" : ""}</p>
                  <Link href={`/stocks?item=${item.id}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-xs font-semibold hover:border-brand/40 hover:bg-brand/5">Mettre à jour</Link>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">Répartition du stock</h2>
          <p className="mt-1 text-sm text-foreground/52">Par usage</p>
          <div className="mx-auto mt-7 grid h-40 w-40 place-items-center rounded-full" style={{ background: `conic-gradient(var(--brand) 0 ${commercialShare}%, var(--surface-muted) ${commercialShare}% 100%)` }}>
            <div className="grid h-28 w-28 place-items-center rounded-full bg-surface text-center"><div><p className="text-3xl font-semibold">{commercialShare}%</p><p className="mt-1 text-xs text-foreground/48">commercialisé</p></div></div>
          </div>
          <div className="mt-7 space-y-3 text-sm">
            <Legend color="bg-brand" label="Stock commercialisé" value={formatCurrency(commercialValue)} />
            <Legend color="bg-surface-muted ring-1 ring-border" label="Outils & consommables" value={formatCurrency(stockValue - commercialValue)} />
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
        <div className="flex items-center justify-between px-5 py-5 sm:px-6"><h2 className="text-xl font-semibold tracking-tight">Activité récente</h2><Link href="/movements" className="text-sm font-semibold text-brand-strong hover:underline">Historique</Link></div>
        <div className="divide-y divide-border border-t border-border md:hidden">
          {demoMovements.map((movement) => (
            <article key={movement.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold leading-5">{movement.itemName}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2 py-1 text-[0.65rem] font-semibold">{movementLabels[movement.type]}</span>
                    <span className="text-xs text-foreground/45">{movement.occurredAt}</span>
                  </div>
                </div>
                <span className={`shrink-0 font-mono text-lg font-semibold ${movement.delta > 0 ? "text-success" : "text-danger"}`}>{movement.delta > 0 ? "+" : ""}{movement.delta}</span>
              </div>
              <p className="mt-3 text-xs text-foreground/50">Effectué par <span className="font-semibold text-foreground/70">{movement.author}</span></p>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y border-border bg-surface-muted/45 text-xs uppercase tracking-[0.08em] text-foreground/45"><tr><th className="px-6 py-3 font-semibold">Article</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Quantité</th><th className="px-4 py-3 font-semibold">Par</th><th className="px-6 py-3 font-semibold">Heure</th></tr></thead>
            <tbody className="divide-y divide-border">
              {demoMovements.map((movement) => <tr key={movement.id}><td className="px-6 py-4 font-medium">{movement.itemName}</td><td className="px-4 py-4 text-foreground/60">{movementLabels[movement.type]}</td><td className={`px-4 py-4 font-mono font-semibold ${movement.delta > 0 ? "text-success" : "text-danger"}`}>{movement.delta > 0 ? "+" : ""}{movement.delta}</td><td className="px-4 py-4 text-foreground/60">{movement.author}</td><td className="px-6 py-4 text-foreground/48">{movement.occurredAt.replace("Aujourd’hui, ", "")}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: "success" | "warning" | "brand" }) {
  const tones = { success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", brand: "bg-brand/10 text-brand-strong" };
  return <article className="rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgb(57_45_30_/_5%)]"><div className="flex items-center justify-between"><p className="text-sm font-medium text-foreground/58">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span></div><p className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{value}</p><p className={`mt-4 flex items-center gap-1.5 text-xs font-semibold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground/50"}`}>{tone === "success" ? <ArrowUpRight size={14} /> : tone === "warning" ? <ArrowDownRight size={14} /> : null}{detail}</p></article>;
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="text-foreground/58">{label}</span><span className="ml-auto font-mono text-xs font-semibold">{value}</span></div>;
}
