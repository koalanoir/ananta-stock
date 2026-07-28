"use client";

import { useMemo, useState } from "react";
import { CookingPot, Minus, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrency, type UserRole } from "@/lib/types";

export type Ingredient = { id: string; name: string; brand: string; unit: string; quantity: number };
export type MenuEntry = {
  id: string; name: string; description: string | null;
  type: "dish" | "cocktail" | "drink" | "other"; selling_price: number; active: boolean;
  menu_item_ingredients: { id: string; item_id: string; quantity_required: number }[];
};

const typeLabels = { dish: "Plat", cocktail: "Cocktail", drink: "Boisson", other: "Autre" };

export function MenuClient({ role, storeId, storeName, currency, userName, ingredients, initialMenu }: {
  role: UserRole; storeId: string; storeName: string; currency: string; userName: string;
  ingredients: Ingredient[]; initialMenu: MenuEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => initialMenu.filter((entry) =>
    `${entry.name} ${entry.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [initialMenu, query]);
  return <AppShell active="menu" role={role} storeName={storeName} userName={userName} businessType="restaurant">
    <PageHeading eyebrow="Restaurant" title="Carte & recettes"
      description="Créez les plats, cocktails et compositions vendus en caisse. Chaque vente déduit automatiquement les ingrédients du stock."
      action={<button onClick={() => setOpen(true)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white"><Plus size={18}/> Ajouter à la carte</button>} />
    <label className="relative mt-7 block">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={18}/>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans la carte…"
        className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 outline-none focus:border-brand"/>
    </label>
    <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((entry) => <article key={entry.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><span className="text-xs font-semibold uppercase tracking-wide text-brand-strong">{typeLabels[entry.type]}</span>
          <h2 className="mt-2 text-lg font-semibold">{entry.name}</h2></div>
          <CookingPot size={20} className="text-foreground/35"/>
        </div>
        {entry.description ? <p className="mt-2 text-sm text-foreground/55">{entry.description}</p> : null}
        <p className="mt-4 font-mono text-xl font-semibold">{formatCurrency(entry.selling_price, currency)}</p>
        <p className="mt-2 text-xs text-foreground/45">{entry.menu_item_ingredients.length} ingrédient{entry.menu_item_ingredients.length > 1 ? "s" : ""}</p>
      </article>)}
    </section>
    {!filtered.length ? <p className="py-20 text-center text-sm text-foreground/50">Aucune composition dans la carte.</p> : null}
    {open ? <MenuDialog storeId={storeId} ingredients={ingredients} onClose={() => setOpen(false)} onSaved={() => {setOpen(false); router.refresh();}}/> : null}
  </AppShell>;
}

function MenuDialog({ storeId, ingredients, onClose, onSaved }: { storeId: string; ingredients: Ingredient[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [type, setType] = useState<MenuEntry["type"]>("dish"); const [price, setPrice] = useState("");
  const [lines, setLines] = useState<Record<string, number>>({}); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  function change(id: string, value: number) { setLines((current) => { const next = {...current}; if (value <= 0) delete next[id]; else next[id] = value; return next; }); }
  async function submit() {
    const ingredient_lines = Object.entries(lines).map(([item_id, quantity]) => ({ item_id, quantity }));
    if (name.trim().length < 2 || Number(price) < 0 || !ingredient_lines.length) return setError("Renseignez un nom, un prix et au moins un ingrédient.");
    const supabase = getSupabaseBrowserClient(); if (!supabase) return setError("Supabase n’est pas configuré.");
    setPending(true); setError("");
    const { error: rpcError } = await supabase.rpc("save_menu_item", { target_store_id: storeId, target_menu_item_id: null, menu_data: { name, description, type, selling_price: Number(price) }, ingredient_lines });
    setPending(false); if (rpcError) return setError(rpcError.message); onSaved();
  }
  return <div className="fixed inset-0 z-50 grid place-items-end bg-sidebar/45 sm:place-items-center sm:p-4">
    <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 sm:max-w-2xl sm:rounded-3xl sm:p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Nouvelle composition</h2><button onClick={onClose} className="grid h-10 w-10 place-items-center"><X size={19}/></button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Nom *" value={name} onChange={setName}/>
        <label className="text-sm font-semibold">Type<select value={type} onChange={(e) => setType(e.target.value as MenuEntry["type"])} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 font-normal">{Object.entries(typeLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <Field label="Prix de vente *" value={price} onChange={setPrice} type="number"/>
        <Field label="Description" value={description} onChange={setDescription}/>
      </div>
      <h3 className="mt-5 font-semibold">Recette</h3><p className="mt-1 text-xs text-foreground/48">Choisissez les articles de stock interne et la quantité consommée par portion.</p>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{ingredients.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="text-xs text-foreground/45">{item.quantity} {item.unit} en stock</p></div>
        <div className="flex h-10 items-center rounded-xl border border-border"><button onClick={() => change(item.id,(lines[item.id]??0)-0.1)} className="grid h-full w-9 place-items-center"><Minus size={14}/></button><input type="number" min="0" step="0.1" value={lines[item.id]??0} onChange={(e) => change(item.id,Number(e.target.value))} className="w-16 bg-transparent text-center font-mono text-sm outline-none"/><button onClick={() => change(item.id,(lines[item.id]??0)+0.1)} className="grid h-full w-9 place-items-center"><Plus size={14}/></button></div>
      </div>)}</div>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <button disabled={pending} onClick={submit} className="mt-5 h-12 w-full rounded-xl bg-brand font-semibold text-white disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer la composition"}</button>
    </div>
  </div>;
}
function Field({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label className="text-sm font-semibold">{label}<input type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 font-normal outline-none focus:border-brand"/></label>}
