"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  TriangleAlert,
  X,
} from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SaleItem = {
  id: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  quantity: number;
};

type SalesClientProps = {
  initialItems: SaleItem[];
  storeName: string;
  userName: string;
};

export function SalesClient({ initialItems, storeName, userName }: SalesClientProps) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [lossItem, setLossItem] = useState<SaleItem | null>(null);
  const [lossQuantity, setLossQuantity] = useState(1);
  const [lossReason, setLossReason] = useState("Produit abîmé");

  const categories = useMemo(
    () => [
      "Toutes",
      ...Array.from(new Set(items.map((item) => item.category))).sort(),
    ],
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");

    return items.filter((item) => {
      const searchable =
        `${item.name} ${item.brand} ${item.category}`.toLocaleLowerCase("fr");

      const matchesQuery =
        !normalizedQuery || searchable.includes(normalizedQuery);

      const matchesCategory =
        category === "Toutes" || item.category === category;

      return matchesQuery && matchesCategory;
    });
  }, [category, items, query]);

  useEffect(() => {
    if (!confirmation) return;

    const timer = window.setTimeout(() => {
      setConfirmation("");
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [confirmation]);

  useEffect(() => {
    if (!errorMessage) return;

    const timer = window.setTimeout(() => {
      setErrorMessage("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [errorMessage]);

  function setQuantity(
    itemId: string,
    requestedValue: number,
    maximum: number,
  ) {
    const normalizedValue = Number.isFinite(requestedValue)
      ? requestedValue
      : 1;

    const value = Math.min(maximum, Math.max(1, normalizedValue));

    setQuantities((current) => ({
      ...current,
      [itemId]: value,
    }));
  }

  async function handleRecordSale(itemId: string) {
    if (pendingItemId) return;

    const item = items.find((candidate) => candidate.id === itemId);

    if (!item || item.quantity <= 0) return;

    const requestedQuantity = quantities[itemId] ?? 1;
    const quantity = Math.min(item.quantity, requestedQuantity);

    if (quantity < 1) return;

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setErrorMessage("La connexion à Supabase n’est pas configurée.");
      return;
    }

    setPendingItemId(itemId);
    setConfirmation("");
    setErrorMessage("");

    const requestId = crypto.randomUUID();

    const { error } = await supabase.rpc("record_sale", {
      target_item_id: item.id,
      quantity_sold: quantity,
      request_id: requestId,
    });

    setPendingItemId(null);

    if (error) {
      console.error("Erreur record_sale :", error);

      if (error.message.toLowerCase().includes("insufficient stock")) {
        setErrorMessage(
          "Le stock disponible a changé. Recharge la page puis réessaie.",
        );
        return;
      }

      setErrorMessage(
        `La vente n’a pas été enregistrée : ${error.message}`,
      );
      return;
    }

    // Mise à jour visuelle après confirmation de Supabase.
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              quantity: Math.max(0, candidate.quantity - quantity),
            }
          : candidate,
      ),
    );

    setQuantities((current) => ({
      ...current,
      [itemId]: 1,
    }));

    setConfirmation(
      `${quantity} ${item.unit}${quantity > 1 ? "s" : ""} · ${item.name} — ${item.brand}`,
    );
  }

  async function handleRecordLoss() {
    if (!lossItem || pendingItemId) return;

    const quantity = Math.min(
      lossItem.quantity,
      Math.max(1, lossQuantity),
    );

    if (!lossReason.trim() || quantity < 1) {
      setErrorMessage("Indiquez la quantité et le motif de la perte.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("La connexion à Supabase n’est pas configurée.");
      return;
    }

    setPendingItemId(lossItem.id);
    setErrorMessage("");

    const { error } = await supabase.rpc("record_stock_loss", {
      target_item_id: lossItem.id,
      quantity_lost: quantity,
      loss_reason: lossReason.trim(),
      request_id: crypto.randomUUID(),
    });

    setPendingItemId(null);

    if (error) {
      setErrorMessage(
        `La perte n’a pas été enregistrée : ${error.message}`,
      );
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === lossItem.id
          ? { ...item, quantity: Math.max(0, item.quantity - quantity) }
          : item,
      ),
    );
    setConfirmation(
      `perte de ${quantity} ${lossItem.unit} · ${lossItem.name}`,
    );
    setLossItem(null);
    setLossQuantity(1);
    setLossReason("Produit abîmé");
  }

  return (
    <AppShell active="sales" role="seller" storeName={storeName} userName={userName}>
      <PageHeading
        eyebrow="Mode vendeur"
        title="Enregistrer une vente"
        description="Recherchez le produit, indiquez la quantité vendue et validez. Le stock est mis à jour immédiatement."
      />

      {confirmation ? (
        <div
          role="status"
          className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-sidebar px-4 py-3 text-sm font-semibold text-white shadow-2xl"
        >
          <CheckCircle2
            className="shrink-0 text-[#7ed2aa]"
            size={21}
            aria-hidden="true"
          />
          <span>Opération enregistrée : {confirmation}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-danger px-4 py-3 text-sm font-semibold text-white shadow-2xl"
        >
          <TriangleAlert
            className="shrink-0"
            size={21}
            aria-hidden="true"
          />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {lossItem ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end bg-sidebar/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLossItem(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="loss-title"
            className="w-full rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">
                  Stock non vendu
                </p>
                <h2 id="loss-title" className="mt-2 text-xl font-semibold">
                  Signaler une perte
                </h2>
                <p className="mt-1 text-sm text-foreground/55">
                  {lossItem.name} · {lossItem.brand}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setLossItem(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-surface-muted"
              >
                <X size={19} />
              </button>
            </div>

            <label className="mt-6 block text-sm font-semibold">
              Quantité perdue
              <input
                type="number"
                min="1"
                max={lossItem.quantity}
                value={lossQuantity}
                onChange={(event) =>
                  setLossQuantity(
                    Math.min(
                      lossItem.quantity,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  )
                }
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 font-mono outline-none focus:border-brand"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold">
              Motif
              <select
                value={lossReason}
                onChange={(event) => setLossReason(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-brand"
              >
                <option>Produit abîmé</option>
                <option>Produit périmé</option>
                <option>Casse</option>
                <option>Vol ou disparition</option>
                <option>Erreur de manipulation</option>
                <option>Autre perte justifiée</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleRecordLoss}
              disabled={Boolean(pendingItemId)}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pendingItemId ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <TriangleAlert size={18} />
              )}
              Confirmer la perte
            </button>
          </section>
        </div>
      ) : null}

      <section className="sticky top-16 z-20 -mx-4 mt-6 border-y border-border bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <label className="relative block">
          <span className="sr-only">Rechercher un produit</span>

          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/38"
            size={20}
            aria-hidden="true"
          />

          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom du produit, marque…"
            className="h-14 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-base shadow-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/10"
          />
        </label>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              className={`h-10 shrink-0 rounded-xl border px-4 text-sm font-semibold transition ${
                category === name
                  ? "border-sidebar bg-sidebar text-white"
                  : "border-border bg-surface hover:border-brand/40"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => {
          const quantity = Math.min(
            item.quantity,
            quantities[item.id] ?? 1,
          );

          const isPending = pendingItemId === item.id;
          const isOutOfStock = item.quantity <= 0;

          return (
            <article
              key={item.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-[0_10px_30px_rgb(57_45_30_/_5%)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold leading-5">
                    {item.name}
                  </h2>

                  <p className="mt-1 text-xs text-foreground/50">
                    {item.brand} · {item.category}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isOutOfStock
                      ? "bg-danger/10 text-danger"
                      : "bg-success/10 text-success"
                  }`}
                >
                  {item.quantity} en stock
                </span>
              </div>

              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
                <div className="flex h-12 items-center rounded-xl border border-border bg-background">
                  <button
                    type="button"
                    aria-label={`Diminuer la quantité de ${item.name}`}
                    onClick={() =>
                      setQuantity(item.id, quantity - 1, item.quantity)
                    }
                    disabled={quantity <= 1 || isOutOfStock || isPending}
                    className="grid h-full w-10 shrink-0 place-items-center disabled:opacity-30"
                  >
                    <Minus size={17} />
                  </button>

                  <input
                    aria-label={`Quantité vendue de ${item.name}`}
                    type="number"
                    min="1"
                    max={item.quantity}
                    step="1"
                    value={isOutOfStock ? 0 : quantity}
                    disabled={isOutOfStock || isPending}
                    onChange={(event) =>
                      setQuantity(
                        item.id,
                        Number(event.target.value),
                        item.quantity,
                      )
                    }
                    className="min-w-0 flex-1 bg-transparent text-center font-mono font-semibold outline-none disabled:opacity-50"
                  />

                  <button
                    type="button"
                    aria-label={`Augmenter la quantité de ${item.name}`}
                    onClick={() =>
                      setQuantity(item.id, quantity + 1, item.quantity)
                    }
                    disabled={
                      quantity >= item.quantity ||
                      isOutOfStock ||
                      isPending
                    }
                    className="grid h-full w-10 shrink-0 place-items-center disabled:opacity-30"
                  >
                    <Plus size={17} />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isOutOfStock || Boolean(pendingItemId)}
                  onClick={() => handleRecordSale(item.id)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-foreground/20"
                >
                  {isPending ? (
                    <>
                      <LoaderCircle
                        className="animate-spin"
                        size={17}
                        aria-hidden="true"
                      />
                      Validation…
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={17} aria-hidden="true" />
                      Vendu
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                disabled={isOutOfStock || Boolean(pendingItemId)}
                onClick={() => {
                  setLossItem(item);
                  setLossQuantity(1);
                }}
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 text-xs font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-40"
              >
                <TriangleAlert size={15} aria-hidden="true" />
                Signaler une perte
              </button>
            </article>
          );
        })}
      </section>

      {!filteredItems.length ? (
        <div className="py-16 text-center">
          <p className="font-semibold">Aucun produit trouvé</p>
          <p className="mt-2 text-sm text-foreground/50">
            Essayez une autre marque, un autre nom ou une autre catégorie.
          </p>
        </div>
      ) : null}
    </AppShell>
  );
}
