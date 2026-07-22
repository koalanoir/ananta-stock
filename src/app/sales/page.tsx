"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { demoItems } from "@/lib/demo-data";

export default function SalesPage() {
  const [items, setItems] = useState(demoItems);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [confirmation, setConfirmation] = useState("");
  const saleableItems = useMemo(() => items.filter((item) => item.kind === "commercialise"), [items]);
  const categories = ["Toutes", ...Array.from(new Set(saleableItems.map((item) => item.category)))];
  const filteredItems = useMemo(() => saleableItems.filter((item) => {
    const searchable = `${item.name} ${item.brand} ${item.category}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase()) && (category === "Toutes" || item.category === category);
  }), [category, query, saleableItems]);

  function setQuantity(itemId: string, value: number, maximum: number) {
    setQuantities((current) => ({ ...current, [itemId]: Math.min(maximum, Math.max(1, value || 1)) }));
  }

  function recordSale(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const quantity = Math.min(item.quantity, quantities[itemId] ?? 1);
    if (quantity < 1) return;
    setItems((current) => current.map((candidate) => candidate.id === itemId ? { ...candidate, quantity: candidate.quantity - quantity } : candidate));
    setQuantities((current) => ({ ...current, [itemId]: 1 }));
    setConfirmation(`${quantity} ${item.unit}${quantity > 1 ? "s" : ""} · ${item.name}`);
    window.setTimeout(() => setConfirmation(""), 3200);
  }

  return (
    <AppShell active="sales" role="seller">
      <PageHeading eyebrow="Mode vendeur" title="Enregistrer une vente" description="Recherchez le produit, indiquez la quantité vendue et validez. Le stock est mis à jour immédiatement." />

      {confirmation ? <div className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-sidebar px-4 py-3 text-sm font-semibold text-white shadow-2xl"><CheckCircle2 className="shrink-0 text-[#7ed2aa]" size={21} /><span>Vente enregistrée : {confirmation}</span></div> : null}

      <section className="sticky top-16 z-20 -mx-4 mt-6 border-y border-border bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <label className="relative block">
          <span className="sr-only">Rechercher un produit</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/38" size={20} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du produit, marque…" className="h-14 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-base shadow-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/10" />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((name) => <button key={name} onClick={() => setCategory(name)} className={`h-10 shrink-0 rounded-xl border px-4 text-sm font-semibold ${category === name ? "border-sidebar bg-sidebar text-white" : "border-border bg-surface"}`}>{name}</button>)}
        </div>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => {
          const quantity = quantities[item.id] ?? 1;
          return <article key={item.id} className="rounded-2xl border border-border bg-surface p-4 shadow-[0_10px_30px_rgb(57_45_30_/_5%)]">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold leading-5">{item.name}</h2><p className="mt-1 text-xs text-foreground/50">{item.category} · {item.brand}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.quantity ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{item.quantity} en stock</span></div>
            <div className="mt-5 grid grid-cols-[1fr_1.3fr] gap-3">
              <div className="flex h-12 items-center rounded-xl border border-border bg-background">
                <button type="button" aria-label="Diminuer" onClick={() => setQuantity(item.id, quantity - 1, item.quantity)} disabled={quantity <= 1} className="grid h-full w-10 place-items-center disabled:opacity-30"><Minus size={17} /></button>
                <input aria-label={`Quantité vendue de ${item.name}`} type="number" min="1" max={item.quantity} value={quantity} onChange={(event) => setQuantity(item.id, Number(event.target.value), item.quantity)} className="min-w-0 flex-1 bg-transparent text-center font-mono font-semibold outline-none" />
                <button type="button" aria-label="Augmenter" onClick={() => setQuantity(item.id, quantity + 1, item.quantity)} disabled={quantity >= item.quantity} className="grid h-full w-10 place-items-center disabled:opacity-30"><Plus size={17} /></button>
              </div>
              <button type="button" disabled={!item.quantity} onClick={() => recordSale(item.id)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:bg-foreground/20"><ShoppingCart size={17} /> Vendu</button>
            </div>
          </article>;
        })}
      </section>
      {!filteredItems.length ? <div className="py-16 text-center"><p className="font-semibold">Aucun produit trouvé</p><p className="mt-2 text-sm text-foreground/50">Essayez une autre marque, un autre nom ou une autre catégorie.</p></div> : null}
    </AppShell>
  );
}
