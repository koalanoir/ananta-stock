"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { demoItems } from "@/lib/demo-data";

export default function CountPage() {
  const items = demoItems;
  const [index, setIndex] = useState(0);
  const [quantity, setQuantity] = useState(items[0].quantity);
  const [completed, setCompleted] = useState(0);
  const item = items[index];

  function next() {
    setCompleted((value) => Math.min(items.length, value + 1));
    if (index < items.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setQuantity(items[nextIndex].quantity);
    }
  }

  return (
    <AppShell active="stocks">
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_24px_70px_rgb(57_45_30_/_10%)]">
        <header className="flex items-center border-b border-border px-5 py-5"><Link href="/stocks" aria-label="Retour aux stocks" className="grid h-10 w-10 place-items-center rounded-full bg-surface-muted"><ArrowLeft size={19} /></Link><div className="ml-3"><h1 className="font-semibold">Comptage rapide</h1><p className="mt-0.5 text-xs text-foreground/48">Marché Central</p></div><span className="ml-auto font-mono text-xs font-semibold">{index + 1} / {items.length}</span></header>
        <div className="h-1 bg-surface-muted"><div className="h-full bg-brand transition-all" style={{ width: `${((index + 1) / items.length) * 100}%` }} /></div>
        <div className="p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-strong">{item.category}</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{item.name}</h2>
          <p className="mt-2 text-sm text-foreground/50">Unité : {item.unit}</p>
          <div className="mt-7 rounded-2xl bg-surface-muted p-5"><p className="text-sm text-foreground/55">Stock enregistré</p><div className="mt-2 flex items-end justify-between"><p className="font-mono text-4xl font-semibold">{item.quantity}</p><p className="text-xs text-foreground/42">Dernière mise à jour hier</p></div></div>
          <p className="mt-7 text-sm font-semibold">Quantité comptée</p>
          <div className="mt-3 grid grid-cols-[64px_1fr_64px] gap-3"><button onClick={() => setQuantity((value) => Math.max(0, value - 1))} aria-label="Retirer une unité" className="grid h-16 place-items-center rounded-2xl border border-border bg-background transition active:scale-95"><Minus /></button><input type="number" min="0" value={quantity} onChange={(event) => setQuantity(Math.max(0, Number(event.target.value)))} aria-label="Quantité comptée" className="h-16 min-w-0 rounded-2xl border border-border bg-surface text-center font-mono text-3xl font-semibold outline-none focus:border-brand" /><button onClick={() => setQuantity((value) => value + 1)} aria-label="Ajouter une unité" className="grid h-16 place-items-center rounded-2xl bg-sidebar text-white transition active:scale-95"><Plus /></button></div>
          <label className="mt-6 block text-sm font-semibold">Note facultative<textarea rows={3} className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand" placeholder="Expliquer un écart inhabituel…" /></label>
          <button onClick={next} className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white shadow-[0_10px_24px_rgb(173_84_38_/_18%)] hover:bg-brand-strong"><Check size={19} /> {index === items.length - 1 ? "Terminer le comptage" : "Valider et passer au suivant"}</button>
          <p className="mt-4 text-center text-xs text-foreground/42">{completed} article{completed > 1 ? "s" : ""} enregistré{completed > 1 ? "s" : ""} dans cette session</p>
        </div>
      </div>
    </AppShell>
  );
}
