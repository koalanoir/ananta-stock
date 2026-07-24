"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Minus, Plus, TriangleAlert } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getCurrentMembership } from "@/lib/data/current-user";
import { getStockItems, type StockOverviewRow } from "@/lib/data/stocks";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CountItem = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  quantity: number;
};

export default function CountPage() {
  const [items, setItems] = useState<CountItem[]>([]);
  const [index, setIndex] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [note, setNote] = useState("");
  const [storeName, setStoreName] = useState("Ma boutique");
  const [userName, setUserName] = useState("Vendeur");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const membership = await getCurrentMembership();
        if (membership.role !== "seller") {
          window.location.replace("/stocks");
          return;
        }
        if (!membership.store_id) {
          throw new Error("Aucune boutique n’est associée à ce compte.");
        }

        const store = membership.stores as { name?: string } | null;
        setStoreName(store?.name?.trim() || "Ma boutique");
        setUserName(
          String(membership.user.user_metadata?.full_name ?? "").trim() ||
            String(membership.user.user_metadata?.username ?? "").trim() ||
            "Vendeur",
        );

        const rows = await getStockItems(membership.store_id);
        const nextItems = rows.map((row: StockOverviewRow) => ({
          id: String(row.item_id),
          name: String(row.name),
          brand: String(row.brand ?? ""),
          unit: String(row.unit),
          quantity: Number(row.quantity),
        }));
        setItems(nextItems);
        setQuantity(nextItems[0]?.quantity ?? 0);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Impossible de charger le comptage.",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const item = items[index];

  async function saveAndNext() {
    if (!item || saving) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Supabase n’est pas configuré.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    if (quantity !== item.quantity) {
      const { error } = await supabase.rpc("record_stock_count", {
        target_item_id: item.id,
        counted_quantity: quantity,
        count_note: note.trim(),
        request_id: crypto.randomUUID(),
      });

      if (error) {
        setSaving(false);
        setErrorMessage(`Le comptage n’a pas été enregistré : ${error.message}`);
        return;
      }
    }

    const nextCompleted = completed + 1;
    setCompleted(nextCompleted);
    setNote("");

    if (index < items.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setQuantity(items[nextIndex].quantity);
    } else {
      setItems([]);
    }

    setSaving(false);
  }

  return (
    <AppShell
      active="stocks"
      role="seller"
      storeName={storeName}
      userName={userName}
    >
      <PageHeading
        eyebrow="Mode vendeur"
        title="Comptage rapide"
        description="Comptez les articles un à un. Seuls les écarts créent un mouvement de stock."
      />

      {errorMessage ? (
        <div role="alert" className="mt-5 flex items-center gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          <TriangleAlert size={18} className="shrink-0" />
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <LoaderCircle className="animate-spin text-brand" />
        </div>
      ) : item ? (
        <section className="mx-auto mt-8 max-w-md overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_24px_70px_rgb(57_45_30_/_10%)]">
          <header className="flex items-center border-b border-border px-5 py-5">
            <div>
              <p className="text-xs text-foreground/48">{storeName}</p>
              <p className="mt-1 font-semibold">{productName(item)}</p>
            </div>
            <span className="ml-auto font-mono text-xs font-semibold">
              {index + 1} / {items.length}
            </span>
          </header>

          <div className="h-1 bg-surface-muted">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${((index + 1) / items.length) * 100}%` }}
            />
          </div>

          <div className="p-5 sm:p-7">
            <div className="rounded-2xl bg-surface-muted p-5">
              <p className="text-sm text-foreground/55">Stock enregistré</p>
              <p className="mt-2 font-mono text-4xl font-semibold">
                {item.quantity}{" "}
                <span className="font-sans text-sm font-normal text-foreground/45">{item.unit}</span>
              </p>
            </div>

            <p className="mt-7 text-sm font-semibold">Quantité comptée</p>
            <div className="mt-3 grid grid-cols-[64px_1fr_64px] gap-3">
              <button type="button" onClick={() => setQuantity((value) => Math.max(0, value - 1))} aria-label="Retirer une unité" className="grid h-16 place-items-center rounded-2xl border border-border bg-background transition active:scale-95">
                <Minus />
              </button>
              <input type="number" min="0" value={quantity} onChange={(event) => setQuantity(Math.max(0, Number(event.target.value)))} aria-label="Quantité comptée" className="h-16 min-w-0 rounded-2xl border border-border bg-surface text-center font-mono text-3xl font-semibold outline-none focus:border-brand" />
              <button type="button" onClick={() => setQuantity((value) => value + 1)} aria-label="Ajouter une unité" className="grid h-16 place-items-center rounded-2xl bg-sidebar text-white transition active:scale-95">
                <Plus />
              </button>
            </div>

            <label className="mt-6 block text-sm font-semibold">
              Note facultative
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand" placeholder="Expliquer un écart inhabituel…" />
            </label>

            <button type="button" disabled={saving} onClick={saveAndNext} className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white shadow-[0_10px_24px_rgb(173_84_38_/_18%)] hover:bg-brand-strong disabled:opacity-60">
              {saving ? <LoaderCircle className="animate-spin" size={19} /> : <Check size={19} />}
              {saving ? "Enregistrement…" : index === items.length - 1 ? "Terminer le comptage" : "Valider et continuer"}
            </button>
          </div>
        </section>
      ) : (
        <div className="py-20 text-center">
          <p className="font-semibold">{completed ? "Comptage terminé" : "Aucun article à compter"}</p>
          <p className="mt-2 text-sm text-foreground/50">
            {completed ? `${completed} article${completed > 1 ? "s" : ""} vérifié${completed > 1 ? "s" : ""}.` : "Le gestionnaire doit d’abord ajouter des articles à la boutique."}
          </p>
        </div>
      )}
    </AppShell>
  );
}

function productName(item: CountItem) {
  if (!item.brand || item.name.toLowerCase().includes(item.brand.toLowerCase())) {
    return item.name;
  }
  return `${item.name} ${item.brand}`;
}
