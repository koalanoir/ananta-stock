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
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-surface-muted/45 text-xs uppercase tracking-[0.07em] text-foreground/44"><tr><th className="px-6 py-4 font-semibold">Date</th><th className="px-4 py-4 font-semibold">Article</th><th className="px-4 py-4 font-semibold">Mouvement</th><th className="px-4 py-4 font-semibold">Quantité</th><th className="px-4 py-4 font-semibold">Motif</th><th className="px-6 py-4 font-semibold">Effectué par</th></tr></thead><tbody className="divide-y divide-border">{demoMovements.map((movement) => <tr key={movement.id}><td className="px-6 py-5 text-foreground/48">{movement.occurredAt}</td><td className="px-4 py-5 font-semibold">{movement.itemName}</td><td className="px-4 py-5"><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold">{labels[movement.type]}</span></td><td className={`px-4 py-5 font-mono font-semibold ${movement.delta > 0 ? "text-success" : "text-danger"}`}>{movement.delta > 0 ? "+" : ""}{movement.delta}</td><td className="px-4 py-5 text-foreground/55">{movement.reason ?? "—"}</td><td className="px-6 py-5 text-foreground/55">{movement.author}</td></tr>)}</tbody></table></div>
      </section>
    </AppShell>
  );
}
