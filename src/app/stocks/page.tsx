"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackagePlus, Search, SlidersHorizontal, X } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getStockStatus, type MovementType, type StockItem } from "@/lib/types";
import { getCurrentMembership } from "@/lib/data/current-user";
import { getStockItems, type StockOverviewRow } from "@/lib/data/stocks";
import { createStockItem, type CreateStockItemInput } from "@/lib/data/catalog";
import { recordStockMovement } from "@/lib/data/movements";
import { CATALOG_CATEGORIES, CATALOG_UNITS } from "@/lib/catalog-options";

type Filter = "all" | "watch" | "rupture";

const statusLabel = { ok: "Disponible", surveillance: "À surveiller", rupture: "En rupture" } as const;
const kindLabel = {
  commercialise: "Commercialisé",
  outil: "Utilitaire",
  ingredient: "Ingrédient",
} as const;

export default function StocksPage() {
  return <Suspense fallback={<div className="min-h-screen bg-background" />}><StocksContent /></Suspense>;
}

function StocksContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [storeName, setStoreName] = useState("Ma boutique");
  const [userName, setUserName] = useState("Gestionnaire");
  const [storeId, setStoreId] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedItemId = searchParams.get("item");
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  useEffect(() => {
    async function loadStocks() {
      try {
        const membership = await getCurrentMembership();

        const store = membership.stores as { name?: string } | null;
        setStoreName(store?.name?.trim() || "Ma boutique");
        setUserName(
          String(membership.user.user_metadata?.full_name ?? "").trim() ||
            membership.user.email ||
            "Gestionnaire",
        );

        if (!membership.store_id) {
          throw new Error("Aucun magasin sélectionné.");
        }

        setStoreId(membership.store_id);
        const rows = await getStockItems(membership.store_id);

        const loadedItems = rows.map((row: StockOverviewRow) => ({
            id: row.item_id,
            name: row.name,
            brand: row.brand,
            category: row.category_name,
            kind: row.kind,
            unit: row.unit,
            quantity: Number(row.quantity),
            threshold: Number(row.threshold),
            unitCost: Number(row.unit_cost),
          }));

        setItems(loadedItems);

        const selected = loadedItems.find((item) => item.id === selectedItemId);
        if (selected) setEditingItem(selected);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Impossible de charger les stocks.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadStocks();
  }, [selectedItemId]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(searchParams.get("filter") === "watch" ? "watch" : "all");
  const [category, setCategory] = useState("Toutes");
  const [isAdding, setIsAdding] = useState(searchParams.get("new") === "1");

  const categories = useMemo(() => ["Toutes", ...Array.from(new Set(items.map((item) => item.category)))], [items]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const status = getStockStatus(item);
    const searchable = `${item.name} ${item.brand} ${item.category}`.toLowerCase();
    const matchesQuery = searchable.includes(query.trim().toLowerCase());
    const matchesCategory = category === "Toutes" || item.category === category;
    const matchesFilter = filter === "all" || (filter === "watch" && status !== "ok") || (filter === "rupture" && status === "rupture");
    return matchesQuery && matchesCategory && matchesFilter;
  }), [category, filter, items, query]);

  async function applyMovement(itemId: string, type: MovementType, quantity: number, reason: string) {
    setIsSaving(true);
    setMutationError("");

    try {
      await recordStockMovement(
        itemId,
        type as Exclude<MovementType, "vente">,
        quantity,
        reason,
      );

      const rows = await getStockItems(storeId);
      setItems(rows.map(toStockItem));
      setEditingItem(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Le mouvement n’a pas pu être enregistré.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function addItem(item: CreateStockItemInput) {
    setIsSaving(true);
    setMutationError("");

    try {
      await createStockItem(storeId, item);
      const rows = await getStockItems(storeId);
      setItems(rows.map(toStockItem));
      setIsAdding(false);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "L’article n’a pas pu être ajouté.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell active="stocks" storeName={storeName} userName={userName}>
      {isLoading ? <p className="mb-4 text-sm text-foreground/50">Chargement des stocks…</p> : null}
      {loadError ? <p role="alert" className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{loadError}</p> : null}
      {mutationError ? <p role="alert" className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{mutationError}</p> : null}
      <PageHeading
        title="Stocks"
        description="Trouvez un article et mettez sa quantité à jour. Chaque opération deviendra un mouvement traçable une fois Supabase connecté."
        action={<button type="button" onClick={() => setIsAdding(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgb(173_84_38_/_18%)] transition hover:bg-brand-strong"><PackagePlus size={18} /> Ajouter un article</button>}
      />

      <section className="mt-8 flex flex-col gap-3 xl:flex-row" aria-label="Filtres du stock">
        <label className="relative flex-1 xl:max-w-lg">
          <span className="sr-only">Rechercher un article</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/38" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, marque ou catégorie…" className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none transition placeholder:text-foreground/35 focus:border-brand focus:ring-3 focus:ring-brand/10" />
        </label>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:overflow-x-auto sm:pb-1">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>Tous <Count>{items.length}</Count></FilterButton>
          <FilterButton active={filter === "watch"} onClick={() => setFilter("watch")}>À surveiller <Count>{items.filter((item) => getStockStatus(item) !== "ok").length}</Count></FilterButton>
          <FilterButton active={filter === "rupture"} onClick={() => setFilter("rupture")}>En rupture <Count>{items.filter((item) => getStockStatus(item) === "rupture").length}</Count></FilterButton>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[220px_1fr]">
        <label className="rounded-2xl border border-border bg-surface p-4 xl:hidden">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/42"><SlidersHorizontal size={14} /> Catégorie</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-brand focus:ring-3 focus:ring-brand/10">
            {categories.map((name) => <option key={name} value={name}>{name} ({name === "Toutes" ? items.length : items.filter((item) => item.category === name).length})</option>)}
          </select>
        </label>

        <aside className="hidden rounded-2xl border border-border bg-surface p-3 xl:block xl:self-start">
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/42"><SlidersHorizontal size={14} /> Catégories</div>
          <div className="mt-1 flex flex-col gap-2">
            {categories.map((name) => <button key={name} onClick={() => setCategory(name)} className={`flex h-10 shrink-0 snap-start items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition ${category === name ? "bg-sidebar text-white" : "hover:bg-surface-muted"}`}>{name}<span className={`ml-3 font-mono text-xs ${category === name ? "text-white/55" : "text-foreground/38"}`}>{name === "Toutes" ? items.length : items.filter((item) => item.category === name).length}</span></button>)}
          </div>
        </aside>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(57_45_30_/_5%)]">
          <div className="divide-y divide-border md:hidden">
            {filteredItems.map((item) => {
              const status = getStockStatus(item);
              return (
                <article key={item.id} className="p-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === "rupture" ? "bg-danger" : status === "surveillance" ? "bg-warning" : "bg-success"}`} />
                    <span className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold ${status === "rupture" ? "bg-danger/10 text-danger" : status === "surveillance" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>{statusLabel[status]}</span>
                  </div>
                  <h2 className="mt-3 break-words text-base font-semibold leading-5">{item.name}</h2>
                  <p className="mt-1.5 text-xs text-foreground/48">{item.category} · {kindLabel[item.kind]}</p>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface-muted/55 p-3">
                    <div><dt className="text-[0.65rem] uppercase tracking-[0.08em] text-foreground/42">Disponible</dt><dd className="mt-1 font-mono text-xl font-semibold">{item.quantity} <span className="font-sans text-xs font-normal text-foreground/45">{item.unit}{item.quantity > 1 ? "s" : ""}</span></dd></div>
                    <div className="border-l border-border pl-3"><dt className="text-[0.65rem] uppercase tracking-[0.08em] text-foreground/42">Seuil d’alerte</dt><dd className="mt-1 font-mono text-xl font-semibold">{item.threshold}</dd></div>
                  </dl>

                  <button onClick={() => setEditingItem(item)} className="mt-4 h-11 w-full rounded-xl border border-border bg-background text-sm font-semibold transition active:scale-[0.99] active:bg-brand/5">Mettre le stock à jour</button>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/45 text-xs uppercase tracking-[0.07em] text-foreground/44"><tr><th className="px-5 py-4 font-semibold">Article</th><th className="px-4 py-4 font-semibold">Catégorie</th><th className="px-4 py-4 font-semibold">Type</th><th className="px-4 py-4 text-center font-semibold">Disponible</th><th className="px-4 py-4 text-center font-semibold">Seuil</th><th className="px-5 py-4 text-right font-semibold">Action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const status = getStockStatus(item);
                  return <tr key={item.id} className="transition hover:bg-surface-muted/25"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`h-8 w-1 rounded-full ${status === "rupture" ? "bg-danger" : status === "surveillance" ? "bg-warning" : "bg-success"}`} /><div><p className="font-semibold">{item.name}</p><p className={`mt-1 text-xs ${status === "rupture" ? "text-danger" : status === "surveillance" ? "text-warning" : "text-success"}`}>{statusLabel[status]}</p></div></div></td><td className="px-4 py-4 text-foreground/58">{item.category}</td><td className="px-4 py-4 text-foreground/58">{kindLabel[item.kind]}</td><td className="px-4 py-4 text-center font-mono text-base font-semibold">{item.quantity}</td><td className="px-4 py-4 text-center font-mono text-foreground/52">{item.threshold}</td><td className="px-5 py-4 text-right"><button onClick={() => setEditingItem(item)} className="h-9 rounded-lg border border-border px-3 text-xs font-semibold transition hover:border-brand/45 hover:bg-brand/5">Mettre à jour</button></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {filteredItems.length === 0 ? <div className="px-6 py-16 text-center"><p className="font-semibold">Aucun article trouvé</p><p className="mt-2 text-sm text-foreground/48">Modifiez vos filtres ou ajoutez un nouvel article.</p></div> : null}
        </div>
      </section>

      {editingItem ? <MovementDialog item={items.find((item) => item.id === editingItem.id) ?? editingItem} pending={isSaving} onClose={() => setEditingItem(null)} onSubmit={applyMovement} /> : null}
      {isAdding ? <AddItemDialog pending={isSaving} onClose={() => setIsAdding(false)} onSubmit={addItem} /> : null}
    </AppShell>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex h-12 min-w-0 shrink-0 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:text-sm ${active ? "border-sidebar bg-sidebar text-white" : "border-border bg-surface hover:border-foreground/20"}`}>{children}</button>;
}

function Count({ children }: { children: React.ReactNode }) { return <span className="font-mono text-xs opacity-55">{children}</span>; }

function MovementDialog({ item, pending, onClose, onSubmit }: { item: StockItem; pending: boolean; onClose: () => void; onSubmit: (id: string, type: MovementType, quantity: number, reason: string) => Promise<void> }) {
  const [type, setType] = useState<MovementType>("entree");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); void onSubmit(item.id, type, quantity, reason); }
  function selectType(value: MovementType) {
    setType(value);
    setQuantity(value === "ajustement" ? item.quantity : 1);
  }
  const isAdjustment = type === "ajustement";
  const maximum = type === "sortie" || type === "perte" ? item.quantity : undefined;
  return <Dialog title="Mettre le stock à jour" onClose={onClose}><form onSubmit={submit}><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-sm text-foreground/48">Stock actuel : <strong className="font-mono text-foreground">{item.quantity}</strong> {item.unit}{item.quantity > 1 ? "s" : ""}</p><div className="mt-5 grid grid-cols-2 gap-2">{(["entree", "sortie", "perte", "ajustement"] as MovementType[]).map((value) => <button type="button" key={value} onClick={() => selectType(value)} className={`h-11 rounded-lg border text-sm font-semibold capitalize ${type === value ? "border-brand bg-brand/10 text-brand-strong" : "border-border"}`}>{value}</button>)}</div><label className="mt-5 block text-sm font-semibold">{isAdjustment ? "Nouvelle quantité en stock" : "Quantité"}<input required min={isAdjustment ? 0 : 1} max={maximum} type="number" value={quantity} onChange={(event) => setQuantity(Math.max(isAdjustment ? 0 : 1, Number(event.target.value)))} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 font-mono outline-none focus:border-brand" /></label><label className="mt-4 block text-sm font-semibold">Motif<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand" placeholder="Réception, casse, inventaire…" /></label><button disabled={pending} type="submit" className="mt-6 h-12 w-full rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-50">{pending ? "Enregistrement…" : "Valider le mouvement"}</button></form></Dialog>;
}

function AddItemDialog({ pending, onClose, onSubmit }: { pending: boolean; onClose: () => void; onSubmit: (item: CreateStockItemInput) => Promise<void> }) {
  const [kind, setKind] = useState<StockItem["kind"]>("commercialise");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const brand = String(data.get("brand")).trim();
    const product = String(data.get("product")).trim();
    void onSubmit({
      name: product,
      brand,
      category: String(data.get("category")).trim(),
      kind,
      unit: String(data.get("unit")).trim(),
      quantity: Number(data.get("quantity")),
      threshold: Number(data.get("threshold")),
      unitCost: Number(data.get("unitCost")),
      sellingPrice:
        kind === "commercialise" ? Number(data.get("sellingPrice")) : 0,
    });
  }
  const fieldClass = "mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand";
  return <Dialog title="Ajouter un article" onClose={onClose}>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Produit et format<input name="product" required autoFocus className={fieldClass} placeholder="Ex. Farine de blé 1 kg" /></label>
      <label className="text-sm font-semibold">Marque <span className="font-normal text-foreground/45">(facultatif)</span><input name="brand" className={fieldClass} placeholder="Ex. Francine" /></label>
      <p className="-mt-2 text-xs text-foreground/50 sm:col-span-2">La marque permet de distinguer deux produits identiques, mais elle peut rester vide.</p>
      <label className="text-sm font-semibold">Catégorie<select name="category" required defaultValue="" className={fieldClass}><option value="" disabled>Sélectionner une catégorie</option>{CATALOG_CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="text-sm font-semibold">Usage
        <select value={kind} onChange={(event) => setKind(event.target.value as StockItem["kind"])} className={fieldClass}>
          <option value="commercialise">Commercialisé</option>
          <option value="outil">Utilitaire</option>
          <option value="ingredient">Ingrédient</option>
        </select>
      </label>
      <p className="-mt-2 text-xs text-foreground/50 sm:col-span-2">
        {kind === "commercialise"
          ? "Cet article est vendu directement et possède un prix de vente."
          : kind === "ingredient"
            ? "Cet article entre dans les recettes et n’est pas vendu directement."
            : "Cet article sert au fonctionnement du commerce et n’est pas vendu."}
      </p>
      <label className="text-sm font-semibold">Unité<select name="unit" required defaultValue="" className={fieldClass}><option value="" disabled>Sélectionner une unité</option>{CATALOG_UNITS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="text-sm font-semibold">Quantité initiale<input name="quantity" type="number" min="0" defaultValue="0" required className={fieldClass} /></label>
      <label className="text-sm font-semibold">Seuil d’alerte<input name="threshold" type="number" min="0" defaultValue="5" required className={fieldClass} /></label>
      <label className="text-sm font-semibold">Coût unitaire (FCFA)<input name="unitCost" type="number" min="0" defaultValue="0" required className={fieldClass} /></label>
      {kind === "commercialise" ? <label className="text-sm font-semibold">Prix de vente (FCFA)<input name="sellingPrice" type="number" min="0" defaultValue="0" required className={fieldClass} /></label> : null}
      <button disabled={pending} className="mt-2 h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-50 sm:col-span-2">{pending ? "Ajout…" : "Ajouter l’article"}</button>
    </form>
  </Dialog>;
}

function toStockItem(row: StockOverviewRow): StockItem {
  return {
    id: row.item_id,
    name: row.name,
    brand: row.brand,
    category: row.category_name,
    kind: row.kind,
    unit: row.unit,
    quantity: Number(row.quantity),
    threshold: Number(row.threshold),
    unitCost: Number(row.unit_cost),
  };
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-sidebar/45 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button onClick={onClose} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full bg-surface-muted hover:bg-border"><X size={18} /></button></div>{children}</div></div>;
}
