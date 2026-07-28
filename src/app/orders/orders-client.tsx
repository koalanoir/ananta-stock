"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  ChevronRight,
  CirclePlus,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrency, type UserRole } from "@/lib/types";

export type OrderStatus =
  | "draft"
  | "ordered"
  | "pending"
  | "received"
  | "cancelled";

export type OrderProduct = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  unitCost: number;
};

export type PurchaseOrderLine = {
  id: string;
  item_id: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost_snapshot: number;
  item: { id: string; name: string; brand: string; unit: string } | null;
};

export type PurchaseOrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  notes: string | null;
  expected_delivery_date: string | null;
  ordered_at: string | null;
  created_at: string;
  closed_incomplete: boolean;
  closed_at: string | null;
  closure_comment: string | null;
  supplier: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  creator: { full_name: string } | null;
  purchase_order_items: PurchaseOrderLine[];
};

export type OrderNotification = {
  id: string;
  title: string;
  message: string;
  purchase_order_id: string | null;
  read_at: string | null;
  created_at: string;
};

type OrdersClientProps = {
  role: UserRole;
  storeId: string;
  storeName: string;
  currency: string;
  userName: string;
  products: OrderProduct[];
  initialOrders: PurchaseOrderSummary[];
  initialNotifications: OrderNotification[];
};

const statusLabels: Record<OrderStatus, string> = {
  draft: "Brouillon",
  ordered: "Commandée",
  pending: "En attente",
  received: "Réceptionnée",
  cancelled: "Annulée",
};

const statusStyles: Record<OrderStatus, string> = {
  draft: "bg-surface-muted text-foreground/65",
  ordered: "bg-brand/10 text-brand-strong",
  pending: "bg-warning/10 text-warning",
  received: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};

export function OrdersClient({
  role,
  storeId,
  storeName,
  currency,
  userName,
  products,
  initialOrders,
  initialNotifications,
}: OrdersClientProps) {
  const router = useRouter();
  const isSeller = role === "seller";
  const [createOpen, setCreateOpen] = useState(false);
  const [receivingOrder, setReceivingOrder] =
    useState<PurchaseOrderSummary | null>(null);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState(initialNotifications);

  const visibleOrders = useMemo(
    () =>
      initialOrders.filter(
        (order) =>
          (filter === "all" || order.status === filter) &&
          (!isSeller || ["ordered", "pending"].includes(order.status)),
      ),
    [filter, initialOrders, isSeller],
  );

  async function changeStatus(order: PurchaseOrderSummary, status: OrderStatus) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Supabase n’est pas configuré.");
    setPending(true);
    setError("");
    const { error: rpcError } = await supabase.rpc(
      "set_purchase_order_status",
      { target_purchase_order_id: order.id, new_status: status },
    );
    setPending(false);
    if (rpcError) return setError(rpcError.message);
    router.refresh();
  }

  async function markRead(notificationId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: rpcError } = await supabase.rpc("mark_notification_read", {
      target_notification_id: notificationId,
    });
    if (!rpcError) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    }
  }

  async function closeIncomplete(order: PurchaseOrderSummary) {
    const comment = window.prompt(
      "Pourquoi la livraison est-elle clôturée incomplète ? (produits manquants, reliquat annulé…)",
    );
    if (!comment?.trim()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Supabase n’est pas configuré.");
    setPending(true);
    setError("");
    const { error: rpcError } = await supabase.rpc(
      "close_purchase_order_incomplete",
      { target_purchase_order_id: order.id, closing_comment: comment },
    );
    setPending(false);
    if (rpcError) return setError(rpcError.message);
    router.refresh();
  }

  const openNotifications = notifications.filter((item) => !item.read_at);

  return (
    <AppShell
      active="orders"
      role={role}
      storeName={storeName}
      userName={userName}
    >
      <PageHeading
        eyebrow={isSeller ? "Réception des livraisons" : "Approvisionnement"}
        title={isSeller ? "Réceptions" : "Commandes fournisseurs"}
        description={
          isSeller
            ? "Contrôlez les lignes reçues. La validation augmente le stock et crée les mouvements automatiquement."
            : "Préparez, envoyez et suivez les commandes de votre boutique."
        }
        action={
          !isSeller ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-lg shadow-brand/15"
            >
              <CirclePlus size={18} /> Nouvelle commande
            </button>
          ) : undefined
        }
      />

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      {!isSeller && openNotifications.length ? (
        <section className="mt-6 rounded-2xl border border-brand/15 bg-brand/5 p-4 sm:p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Bell size={18} className="text-brand-strong" />
            Livraisons récentes
          </div>
          <div className="mt-3 space-y-2">
            {openNotifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => markRead(notification.id)}
                className="flex w-full items-start justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left text-sm shadow-sm"
              >
                <span>
                  <span className="block font-semibold">{notification.title}</span>
                  <span className="mt-1 block text-foreground/55">
                    {notification.message}
                  </span>
                </span>
                <Check size={17} className="mt-1 shrink-0 text-success" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!isSeller ? (
        <div className="mt-7 flex gap-2 overflow-x-auto pb-1">
          {(["all", "draft", "ordered", "pending", "received"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`h-10 shrink-0 rounded-xl border px-4 text-sm font-semibold ${
                  filter === status
                    ? "border-sidebar bg-sidebar text-white"
                    : "border-border bg-surface"
                }`}
              >
                {status === "all" ? "Toutes" : statusLabels[status]}
              </button>
            ),
          )}
        </div>
      ) : null}

      <section className="mt-5 grid gap-4">
        {visibleOrders.map((order) => {
          const expected = order.purchase_order_items.reduce(
            (total, line) => total + line.ordered_quantity,
            0,
          );
          const received = order.purchase_order_items.reduce(
            (total, line) => total + line.received_quantity,
            0,
          );
          const amount = order.purchase_order_items.reduce(
            (total, line) =>
              total + line.ordered_quantity * line.unit_cost_snapshot,
            0,
          );
          return (
            <article
              key={order.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-[0_12px_40px_rgb(57_45_30_/_5%)] sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-sm font-semibold">
                      {order.order_number}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}
                    >
                      {order.closed_incomplete
                        ? "Clôturée incomplète"
                        : statusLabels[order.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {order.supplier?.name ?? "Fournisseur"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/48">
                    {order.purchase_order_items.length} produit
                    {order.purchase_order_items.length > 1 ? "s" : ""} ·{" "}
                    {received}/{expected} unité{expected > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="font-mono font-semibold">
                    {formatCurrency(amount, currency)}
                  </p>
                  <p className="mt-1 text-xs text-foreground/48">
                    Livraison{" "}
                    {order.expected_delivery_date
                      ? new Intl.DateTimeFormat("fr-FR").format(
                          new Date(`${order.expected_delivery_date}T12:00:00`),
                        )
                      : "non datée"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-3">
                {order.purchase_order_items.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-xl bg-surface-muted/55 px-3 py-2.5 text-sm"
                  >
                    <p className="truncate font-semibold">
                      {line.item?.name ?? "Produit supprimé"}
                    </p>
                    <p className="mt-1 text-xs text-foreground/50">
                      {line.received_quantity}/{line.ordered_quantity}{" "}
                      {line.item?.unit ?? "unité"} reçu
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {!isSeller && order.status === "draft" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => changeStatus(order, "ordered")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Commander <ChevronRight size={16} />
                  </button>
                ) : null}
                {!isSeller && order.status === "ordered" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => changeStatus(order, "pending")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50"
                  >
                    Marquer en attente
                  </button>
                ) : null}
                {isSeller && ["ordered", "pending"].includes(order.status) ? (
                  <button
                    type="button"
                    onClick={() => setReceivingOrder(order)}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white"
                  >
                    <PackageCheck size={17} /> Réceptionner
                  </button>
                ) : null}
                {isSeller &&
                order.status === "pending" &&
                received > 0 &&
                received < expected ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => closeIncomplete(order)}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-warning/30 px-4 text-sm font-semibold text-warning disabled:opacity-50"
                  >
                    Clôturer avec manquants
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {!visibleOrders.length ? (
        <div className="py-20 text-center">
          <Truck className="mx-auto text-foreground/25" size={38} />
          <p className="mt-4 font-semibold">
            {isSeller ? "Aucune livraison à réceptionner" : "Aucune commande"}
          </p>
          <p className="mt-2 text-sm text-foreground/48">
            {isSeller
              ? "Les commandes envoyées par le gestionnaire apparaîtront ici."
              : "Créez votre première commande fournisseur."}
          </p>
        </div>
      ) : null}

      {createOpen ? (
        <CreateOrderDialog
          products={products}
          storeId={storeId}
          onClose={() => setCreateOpen(false)}
          onError={setError}
        />
      ) : null}
      {receivingOrder ? (
        <ReceiveOrderDialog
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onError={setError}
        />
      ) : null}
    </AppShell>
  );
}

function CreateOrderDialog({
  products,
  storeId,
  onClose,
  onError,
}: {
  products: OrderProduct[];
  storeId: string;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const filtered = products.filter((product) =>
    `${product.name} ${product.brand}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  function updateQuantity(itemId: string, value: number) {
    setQuantities((current) => {
      const next = { ...current };
      if (value <= 0) delete next[itemId];
      else next[itemId] = value;
      return next;
    });
  }

  async function submit() {
    const lines = Object.entries(quantities).map(([item_id, quantity]) => ({
      item_id,
      quantity,
    }));
    if (supplier.trim().length < 2 || !lines.length) {
      return onError("Renseignez un fournisseur et au moins un produit.");
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return onError("Supabase n’est pas configuré.");
    setPending(true);
    onError("");
    const { error } = await supabase.rpc("create_purchase_order", {
      target_store_id: storeId,
      supplier_data: { name: supplier, email, phone },
      order_lines: lines,
      order_notes: notes,
      expected_delivery: expectedDate || null,
      operation_id: crypto.randomUUID(),
    });
    setPending(false);
    if (error) return onError(error.message);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title="Nouvelle commande" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Fournisseur *"
          value={supplier}
          onChange={setSupplier}
          placeholder="Nom du fournisseur"
        />
        <Input
          label="Livraison prévue"
          value={expectedDate}
          onChange={setExpectedDate}
          type="date"
        />
        <Input
          label="E-mail"
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="Optionnel"
        />
        <Input
          label="Téléphone"
          value={phone}
          onChange={setPhone}
          placeholder="Optionnel"
        />
      </div>
      <label className="mt-4 block text-sm font-semibold">
        Notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-2 min-h-20 w-full rounded-xl border border-border bg-surface p-3 font-normal outline-none focus:border-brand"
        />
      </label>
      <div className="relative mt-4">
        <Search
          size={17}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un produit…"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-brand"
        />
      </div>
      <div className="mt-3 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
        {filtered.map((product) => {
          const quantity = quantities[product.id] ?? 0;
          return (
            <div
              key={product.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{product.name}</p>
                <p className="mt-1 text-xs text-foreground/48">
                  {product.brand || "Sans marque"} · {product.unit}
                </p>
              </div>
              <div className="flex h-10 shrink-0 items-center rounded-xl border border-border">
                <button
                  type="button"
                  aria-label="Diminuer"
                  onClick={() => updateQuantity(product.id, quantity - 1)}
                  className="grid h-full w-9 place-items-center"
                >
                  <Minus size={15} />
                </button>
                <input
                  aria-label={`Quantité de ${product.name}`}
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(event) =>
                    updateQuantity(product.id, Number(event.target.value))
                  }
                  className="w-12 bg-transparent text-center font-mono text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  aria-label="Augmenter"
                  onClick={() => updateQuantity(product.id, quantity + 1)}
                  className="grid h-full w-9 place-items-center"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"
      >
        <CirclePlus size={17} />
        {pending ? "Création…" : "Créer le brouillon"}
      </button>
    </Dialog>
  );
}

function ReceiveOrderDialog({
  order,
  onClose,
  onError,
}: {
  order: PurchaseOrderSummary;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<
    Record<string, { quantity: number; comment: string }>
  >({});
  const [comment, setComment] = useState("");
  const [closeAfterReceipt, setCloseAfterReceipt] = useState(false);
  const [pending, setPending] = useState(false);

  function setLine(
    id: string,
    value: Partial<{ quantity: number; comment: string }>,
  ) {
    setLines((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { quantity: 0, comment: "" }), ...value },
    }));
  }

  async function submit() {
    const receivedLines = order.purchase_order_items
      .map((line) => ({
        purchase_order_item_id: line.id,
        quantity: lines[line.id]?.quantity ?? 0,
        comment: lines[line.id]?.comment ?? "",
        movement_id: crypto.randomUUID(),
      }))
      .filter((line) => line.quantity > 0);
    if (!receivedLines.length) {
      return onError("Indiquez au moins une quantité reçue.");
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return onError("Supabase n’est pas configuré.");
    setPending(true);
    onError("");
    const { error } = await supabase.rpc("receive_purchase_order", {
      target_purchase_order_id: order.id,
      received_lines: receivedLines,
      receipt_comment: comment,
      operation_id: crypto.randomUUID(),
    });
    if (error) {
      setPending(false);
      return onError(error.message);
    }
    const willRemainIncomplete = order.purchase_order_items.some((line) => {
      const receivedNow = lines[line.id]?.quantity ?? 0;
      return line.received_quantity + receivedNow < line.ordered_quantity;
    });
    if (closeAfterReceipt && willRemainIncomplete) {
      if (comment.trim().length < 3) {
        setPending(false);
        return onError("Ajoutez un commentaire expliquant les produits manquants.");
      }
      const { error: closeError } = await supabase.rpc(
        "close_purchase_order_incomplete",
        {
          target_purchase_order_id: order.id,
          closing_comment: comment,
        },
      );
      if (closeError) {
        setPending(false);
        return onError(closeError.message);
      }
    }
    setPending(false);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title={`Réception ${order.order_number}`} onClose={onClose}>
      <p className="text-sm text-foreground/55">
        Fournisseur :{" "}
        <span className="font-semibold text-foreground">
          {order.supplier?.name}
        </span>
      </p>
      <div className="mt-4 space-y-3">
        {order.purchase_order_items.map((line) => {
          const remaining = line.ordered_quantity - line.received_quantity;
          const value = lines[line.id]?.quantity ?? 0;
          return (
            <div
              key={line.id}
              className="rounded-xl border border-border p-3 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{line.item?.name}</p>
                  <p className="mt-1 text-xs text-foreground/48">
                    Reste {remaining} {line.item?.unit}
                  </p>
                </div>
                <input
                  aria-label={`Quantité reçue de ${line.item?.name}`}
                  type="number"
                  min="0"
                  max={remaining}
                  value={value}
                  onChange={(event) =>
                    setLine(line.id, {
                      quantity: Math.min(
                        remaining,
                        Math.max(0, Number(event.target.value)),
                      ),
                    })
                  }
                  className="h-10 w-24 rounded-xl border border-border bg-surface px-3 text-center font-mono font-semibold outline-none focus:border-brand"
                />
              </div>
              <input
                value={lines[line.id]?.comment ?? ""}
                onChange={(event) =>
                  setLine(line.id, { comment: event.target.value })
                }
                placeholder="Commentaire sur cette ligne (optionnel)"
                className="mt-3 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
              />
            </div>
          );
        })}
      </div>
      <label className="mt-4 block text-sm font-semibold">
        Commentaire général
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="mt-2 min-h-20 w-full rounded-xl border border-border bg-surface p-3 font-normal outline-none focus:border-brand"
        />
      </label>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-3 text-sm">
        <input
          type="checkbox"
          checked={closeAfterReceipt}
          onChange={(event) => setCloseAfterReceipt(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
        />
        <span>
          <span className="block font-semibold">Clôturer même si la livraison est incomplète</span>
          <span className="mt-1 block text-xs text-foreground/50">
            Les quantités reçues augmenteront le stock. Les reliquats manquants seront archivés avec le commentaire ci-dessus.
          </span>
        </span>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"
      >
        <PackageCheck size={18} />
        {pending ? "Validation…" : "Valider la réception"}
      </button>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-end bg-sidebar/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-background p-4 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-muted"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 font-normal outline-none focus:border-brand"
      />
    </label>
  );
}
