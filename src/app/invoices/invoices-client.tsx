"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  Mail,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import {
  downloadInvoicePdf,
  type InvoiceDocument,
} from "@/lib/invoices";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export type BillingProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  price: number;
  quantity: number;
};

export type BillingCustomer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

type InvoicesClientProps = {
  initialProducts: BillingProduct[];
  initialCustomers: BillingCustomer[];
  initialInvoices: InvoiceDocument[];
  storeId: string;
  storeName: string;
  currency: string;
  userName: string;
  role: UserRole;
};

export function InvoicesClient({
  initialProducts,
  initialCustomers,
  initialInvoices,
  storeId,
  storeName,
  currency,
  userName,
  role,
}: InvoicesClientProps) {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [products, setProducts] = useState(initialProducts);
  const [customers, setCustomers] = useState(initialCustomers);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const cartLines = useMemo(
    () =>
      products
        .filter((product) => cart[product.id])
        .map((product) => ({
          ...product,
          cartQuantity: cart[product.id],
        })),
    [cart, products],
  );
  const total = cartLines.reduce(
    (sum, line) => sum + line.price * line.cartQuantity,
    0,
  );
  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.brand} ${product.category}`
      .toLocaleLowerCase("fr")
      .includes(query.trim().toLocaleLowerCase("fr")),
  );

  function changeCart(product: BillingProduct, delta: number) {
    setCart((current) => {
      const next = Math.min(
        product.quantity,
        Math.max(0, (current[product.id] ?? 0) + delta),
      );
      if (!next) {
        const rest = { ...current };
        delete rest[product.id];
        return rest;
      }
      return { ...current, [product.id]: next };
    });
  }

  async function createInvoice() {
    if (!cartLines.length || pending) return;
    if (!customerId && customerName.trim().length < 2) {
      setErrorMessage("Sélectionnez un client ou renseignez son nom.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setErrorMessage("Supabase n’est pas configuré.");

    setPending(true);
    setErrorMessage("");
    setMessage("");

    const { data, error } = await supabase.rpc("create_invoice", {
      target_store_id: storeId,
      target_customer_id: customerId || null,
      customer_data: {
        full_name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
      },
      cart_items: cartLines.map((line) => ({
        item_id: line.id,
        quantity: line.cartQuantity,
        movement_id: crypto.randomUUID(),
      })),
      request_id: crypto.randomUUID(),
    });

    if (error) {
      setPending(false);
      setErrorMessage(`La facture n’a pas été créée : ${error.message}`);
      return;
    }

    const invoiceId = (data as { id: string }).id;
    const { data: invoiceData, error: loadError } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, total_amount, created_at, email_status,
        customer:customers(id, full_name, email, phone),
        seller:profiles!invoices_seller_id_fkey(full_name),
        invoice_items(item_id, description, quantity, unit_price, line_total)
      `)
      .eq("id", invoiceId)
      .single();

    if (loadError || !invoiceData) {
      setPending(false);
      setErrorMessage("Facture créée, mais son document n’a pas pu être chargé.");
      return;
    }

    const invoice = normalizeInvoice(invoiceData);
    setInvoices((current) => [invoice, ...current]);
    setProducts((current) =>
      current.map((product) => ({
        ...product,
        quantity:
          product.quantity -
          (cartLines.find((line) => line.id === product.id)?.cartQuantity ?? 0),
      })),
    );
    setCart({});
    setCustomerId("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setPending(false);
    downloadInvoicePdf(invoice, storeName, currency);

    if (invoice.customer && !customers.some((c) => c.id === invoice.customer?.id)) {
      setCustomers((current) => [
        {
          ...invoice.customer!,
          notes: null,
          created_at: invoice.created_at,
        },
        ...current,
      ]);
    }

    if (invoice.customer?.email) {
      await sendInvoice(invoice);
    } else {
      setMessage(`Facture ${invoice.invoice_number} créée et téléchargée.`);
    }
    setTab("history");
  }

  async function sendInvoice(invoice: InvoiceDocument) {
    setSendingId(invoice.id);
    setErrorMessage("");

    const response = await fetch(`/api/invoices/${invoice.id}/email`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };
    setSendingId(null);

    if (!response.ok) {
      setErrorMessage(
        payload.error ??
          "La facture existe, mais l’e-mail n’a pas pu être envoyé.",
      );
      return;
    }

    setInvoices((current) =>
      current.map((candidate) =>
        candidate.id === invoice.id
          ? { ...candidate, email_status: "sent" }
          : candidate,
      ),
    );
    setMessage(`Facture ${invoice.invoice_number} envoyée par e-mail.`);
  }

  return (
    <AppShell
      active="invoices"
      role={role}
      storeName={storeName}
      userName={userName}
    >
      <PageHeading
        eyebrow="Facturation"
        title="Factures"
        description="Créez une facture multi-produits, rattachez un client puis téléchargez ou envoyez le PDF."
      />

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-surface-muted p-1 sm:max-w-md">
        <TabButton active={tab === "new"} onClick={() => setTab("new")}>
          Nouvelle facture
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          Historique ({invoices.length})
        </TabButton>
      </div>

      {message ? (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">
          <CheckCircle2 size={18} /> {message}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          <TriangleAlert className="mt-0.5 shrink-0" size={18} />
          {errorMessage}
        </div>
      ) : null}

      {tab === "new" ? (
        <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <section>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={19} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un produit ou une marque…"
                className="h-13 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none focus:border-brand"
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  className="rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-semibold">
                        {productName(product)}
                      </h2>
                      <p className="mt-1 text-xs text-foreground/48">
                        {product.category}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-foreground/50">
                      {product.quantity} en stock
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="font-mono text-sm font-semibold">
                      {formatMoney(product.price, currency)}
                    </p>
                    <button
                      type="button"
                      disabled={!product.quantity}
                      onClick={() => changeCart(product, 1)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-sidebar px-3 text-xs font-semibold text-white disabled:opacity-35"
                    >
                      <Plus size={16} /> Ajouter
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="self-start rounded-2xl border border-border bg-surface p-4 shadow-[0_12px_40px_rgb(57_45_30_/_6%)] sm:p-5 xl:sticky xl:top-6">
            <div className="flex items-center gap-2">
              <ShoppingCart size={19} className="text-brand-strong" />
              <h2 className="text-lg font-semibold">Panier</h2>
              <span className="ml-auto font-mono text-xs">
                {cartLines.length} ligne{cartLines.length > 1 ? "s" : ""}
              </span>
            </div>

            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
              {cartLines.map((line) => (
                <div key={line.id} className="rounded-xl bg-surface-muted/55 p-3">
                  <p className="pr-8 text-sm font-semibold">{productName(line)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => changeCart(line, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface">
                      <Minus size={15} />
                    </button>
                    <span className="min-w-8 text-center font-mono text-sm font-semibold">
                      {line.cartQuantity}
                    </span>
                    <button type="button" onClick={() => changeCart(line, 1)} disabled={line.cartQuantity >= line.quantity} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface disabled:opacity-35">
                      <Plus size={15} />
                    </button>
                    <p className="ml-auto font-mono text-xs font-semibold">
                      {formatMoney(line.price * line.cartQuantity, currency)}
                    </p>
                    <button type="button" aria-label={`Retirer ${line.name}`} onClick={() => setCart((current) => {
                      const next = { ...current };
                      delete next[line.id];
                      return next;
                    })} className="text-danger">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {!cartLines.length ? (
                <p className="py-8 text-center text-sm text-foreground/45">
                  Ajoutez des produits pour commencer.
                </p>
              ) : null}
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <label className="text-sm font-semibold">
                Client existant
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand"
                >
                  <option value="">Nouveau client</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name}
                    </option>
                  ))}
                </select>
              </label>

              {!customerId ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom complet *" className={inputClass} />
                  <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="E-mail" className={inputClass} />
                  <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Téléphone" className={inputClass} />
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-border pt-5">
              <span className="font-semibold">Total</span>
              <span className="font-mono text-xl font-semibold">
                {formatMoney(total, currency)}
              </span>
            </div>
            <button
              type="button"
              onClick={createInvoice}
              disabled={pending || !cartLines.length}
              className="mt-4 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-45"
            >
              {pending ? <LoaderCircle className="animate-spin" size={18} /> : <FileText size={18} />}
              {pending ? "Création…" : "Créer la facture"}
            </button>
          </aside>
        </div>
      ) : (
        <section className="mt-6 space-y-3">
          {invoices.map((invoice) => (
            <article
              key={invoice.id}
              className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 lg:w-48">
                  <p className="font-mono text-sm font-semibold">
                    {invoice.invoice_number}
                  </p>
                  <p className="mt-1 text-xs text-foreground/45">
                    {formatDate(invoice.created_at)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {invoice.customer?.full_name ?? "Client comptoir"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/45">
                    {invoice.invoice_items.length} article{invoice.invoice_items.length > 1 ? "s" : ""}
                    {invoice.seller?.full_name ? ` · ${invoice.seller.full_name}` : ""}
                  </p>
                </div>
                <p className="font-mono text-lg font-semibold">
                  {formatMoney(invoice.total_amount, currency)}
                </p>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                  invoice.email_status === "sent"
                    ? "bg-success/10 text-success"
                    : invoice.email_status === "failed"
                      ? "bg-danger/10 text-danger"
                      : "bg-surface-muted text-foreground/50"
                }`}>
                  {invoice.email_status === "sent" ? "E-mail envoyé" : invoice.email_status === "failed" ? "Échec e-mail" : "Non envoyée"}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <ActionButton onClick={() => downloadInvoicePdf(invoice, storeName, currency)} icon={<Download size={15} />}>
                    Télécharger
                  </ActionButton>
                  <ActionButton onClick={() => downloadInvoicePdf(invoice, storeName, currency)} icon={<Printer size={15} />}>
                    Réimprimer
                  </ActionButton>
                  {invoice.customer?.email ? (
                    <ActionButton onClick={() => sendInvoice(invoice)} disabled={sendingId === invoice.id} icon={sendingId === invoice.id ? <LoaderCircle className="animate-spin" size={15} /> : <Mail size={15} />}>
                      Envoyer
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {!invoices.length ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="font-semibold">Aucune facture</p>
              <p className="mt-2 text-sm text-foreground/48">
                La première facture apparaîtra ici.
              </p>
            </div>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`h-10 rounded-lg text-sm font-semibold transition ${active ? "bg-surface shadow-sm" : "text-foreground/50"}`}>{children}</button>;
}

function ActionButton({ onClick, icon, children, disabled = false }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:border-brand/40 disabled:opacity-45">{icon}{children}</button>;
}

function productName(product: { name: string; brand: string }) {
  return product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase())
    ? `${product.name} ${product.brand}`
    : product.name;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function normalizeInvoice(row: unknown): InvoiceDocument {
  const invoice = row as InvoiceDocument;
  return {
    ...invoice,
    total_amount: Number(invoice.total_amount),
    invoice_items: (invoice.invoice_items ?? []).map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      line_total: Number(line.line_total),
    })),
  };
}

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand";
