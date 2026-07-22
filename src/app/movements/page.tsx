import { Download, Filter } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { demoMovements } from "@/lib/demo-data";

const labels = { entree: "Entrée", sortie: "Sortie", perte: "Perte", ajustement: "Ajustement" } as const;

export default function MovementsPage() {
  return (
    <AppShell active="movements">
      <PageHeading title="Mouvements" description="Un historique simple et infalsifiable de chaque variation du stock." action={<button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold shadow-sm hover:border-foreground/20"><Download size={17} /> Exporter en CSV</button>} />
      <div className="mt-8 flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm text-foreground/55"><Filter size={17} /><span>Derniers mouvements · Toutes les catégories · Tous les utilisateurs</span></div>
      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
        <div className="divide-y divide-border md:hidden">
          {demoMovements.map((movement) => (
            <article key={movement.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold leading-5">{movement.itemName}</h2>
                  <p className="mt-1.5 text-xs text-foreground/48">{movement.occurredAt}</p>
                </div>
                <span className={`shrink-0 font-mono text-xl font-semibold ${movement.delta > 0 ? "text-success" : "text-danger"}`}>{movement.delta > 0 ? "+" : ""}{movement.delta}</span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface-muted/55 p-3 text-xs">
                <div><dt className="text-[0.65rem] uppercase tracking-[0.08em] text-foreground/42">Mouvement</dt><dd className="mt-1.5"><span className="rounded-full bg-surface px-2 py-1 font-semibold">{labels[movement.type]}</span></dd></div>
                <div className="border-l border-border pl-3"><dt className="text-[0.65rem] uppercase tracking-[0.08em] text-foreground/42">Effectué par</dt><dd className="mt-1.5 font-semibold">{movement.author}</dd></div>
              </dl>
              {movement.reason ? <p className="mt-3 text-xs text-foreground/55"><span className="font-semibold text-foreground/70">Motif :</span> {movement.reason}</p> : null}
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-surface-muted/45 text-xs uppercase tracking-[0.07em] text-foreground/44"><tr><th className="px-6 py-4 font-semibold">Date</th><th className="px-4 py-4 font-semibold">Article</th><th className="px-4 py-4 font-semibold">Mouvement</th><th className="px-4 py-4 font-semibold">Quantité</th><th className="px-4 py-4 font-semibold">Motif</th><th className="px-6 py-4 font-semibold">Effectué par</th></tr></thead><tbody className="divide-y divide-border">{demoMovements.map((movement) => <tr key={movement.id}><td className="px-6 py-5 text-foreground/48">{movement.occurredAt}</td><td className="px-4 py-5 font-semibold">{movement.itemName}</td><td className="px-4 py-5"><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold">{labels[movement.type]}</span></td><td className={`px-4 py-5 font-mono font-semibold ${movement.delta > 0 ? "text-success" : "text-danger"}`}>{movement.delta > 0 ? "+" : ""}{movement.delta}</td><td className="px-4 py-5 text-foreground/55">{movement.reason ?? "—"}</td><td className="px-6 py-5 text-foreground/55">{movement.author}</td></tr>)}</tbody></table></div>
      </section>
    </AppShell>
  );
}
