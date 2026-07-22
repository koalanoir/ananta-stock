"use client";

import { useState } from "react";
import { Clock3, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";

const initialSellers = [
  { id: "aicha", name: "Aïcha Mbemba", status: "En poste", hours: "08:02 – maintenant", sales: 42 },
  { id: "moussa", name: "Moussa Diallo", status: "Hors ligne", hours: "07:58 – 15:06", sales: 31 },
  { id: "nadia", name: "Nadia Bissiki", status: "Hors ligne", hours: "09:10 – 14:30", sales: 18 },
];

export default function SettingsPage() {
  const [sellers, setSellers] = useState(initialSellers);
  return <AppShell active="settings">
    <PageHeading eyebrow="Administration" title="Paramètres" description="Gérez les accès vendeurs, suivez leurs horaires et consultez leur activité depuis un seul écran." action={<button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white"><Plus size={18} /> Créer un vendeur</button>} />
    <section className="mt-8 grid gap-4 sm:grid-cols-3">
      <Summary icon={<UserRound size={18} />} label="Vendeurs actifs" value="1 / 3" />
      <Summary icon={<Clock3 size={18} />} label="Heures aujourd’hui" value="21 h 26" />
      <Summary icon={<ShieldCheck size={18} />} label="Ventes enregistrées" value="91" />
    </section>
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
      <div className="border-b border-border px-5 py-5"><h2 className="text-xl font-semibold">Équipe de vente</h2><p className="mt-1 text-sm text-foreground/50">Activité et résultats de la journée</p></div>
      <div className="divide-y divide-border">
        {sellers.map((seller) => <article key={seller.id} className="grid gap-4 p-5 md:grid-cols-[1.2fr_1fr_0.7fr_auto] md:items-center">
          <div><p className="font-semibold">{seller.name}</p><p className={`mt-1 text-xs font-semibold ${seller.status === "En poste" ? "text-success" : "text-foreground/45"}`}>● {seller.status}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-foreground/40">Horaires</p><p className="mt-1 text-sm font-medium">{seller.hours}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-foreground/40">Ventes</p><p className="mt-1 font-mono text-lg font-semibold">{seller.sales}</p></div>
          <button onClick={() => setSellers((current) => current.filter((item) => item.id !== seller.id))} aria-label={`Supprimer ${seller.name}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 text-xs font-semibold text-danger hover:bg-danger/5"><Trash2 size={15} /> Supprimer</button>
        </article>)}
      </div>
    </section>
    <p className="mt-4 text-xs leading-5 text-foreground/45">Les horaires seront calculés à partir des connexions et déconnexions. Les suppressions devront demander une confirmation lorsque Supabase sera connecté.</p>
  </AppShell>;
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="rounded-2xl border border-border bg-surface p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand-strong">{icon}</span><p className="mt-4 text-sm text-foreground/55">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>;
}
