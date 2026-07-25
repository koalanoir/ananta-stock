"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Mail,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CustomerInvoice = {
  id: string;
  invoice_number: string;
  total_amount: number;
  created_at: string;
  status: string;
};

export type CustomerSummary = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  invoices: CustomerInvoice[];
};

type CustomersClientProps = {
  initialCustomers: CustomerSummary[];
  storeId: string;
  storeName: string;
  currency: string;
  userName: string;
  role: "owner" | "manager";
};

export function CustomersClient({
  initialCustomers,
  storeId,
  storeName,
  currency,
  userName,
  role,
}: CustomersClientProps) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return customers.filter((customer) =>
      `${customer.full_name} ${customer.email ?? ""} ${customer.phone ?? ""}`
        .toLocaleLowerCase("fr")
        .includes(normalized),
    );
  }, [customers, query]);

  const totalRevenue = customers.reduce(
    (sum, customer) =>
      sum +
      customer.invoices.reduce(
        (invoiceSum, invoice) =>
          invoiceSum + (invoice.status === "issued" ? invoice.total_amount : 0),
        0,
      ),
    0,
  );
  const totalPurchases = customers.reduce(
    (sum, customer) =>
      sum + customer.invoices.filter((invoice) => invoice.status === "issued").length,
    0,
  );

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setErrorMessage("Supabase n’est pas configuré.");

    setPending(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("create_customer", {
      target_store_id: storeId,
      customer_name: String(form.get("name") ?? ""),
      customer_email: String(form.get("email") ?? ""),
      customer_phone: String(form.get("phone") ?? ""),
      customer_notes: String(form.get("notes") ?? ""),
    });
    setPending(false);

    if (error) {
      setErrorMessage(`Le client n’a pas été créé : ${error.message}`);
      return;
    }

    const customer = data as Omit<CustomerSummary, "invoices">;
    setCustomers((current) => {
      const existing = current.find((candidate) => candidate.id === customer.id);
      if (existing) {
        return current.map((candidate) =>
          candidate.id === customer.id
            ? { ...candidate, ...customer }
            : candidate,
        );
      }
      return [{ ...customer, invoices: [] }, ...current];
    });
    setIsAdding(false);
  }

  return (
    <AppShell
      active="customers"
      role={role}
      storeName={storeName}
      userName={userName}
    >
      <PageHeading
        eyebrow="CRM léger"
        title="Clients"
        description="Centralisez les coordonnées, l’historique, les dépenses et le nombre d’achats de vos clients."
        action={
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white"
          >
            <Plus size={18} /> Nouveau client
          </button>
        }
      />

      <section className="mt-7 grid gap-3 sm:grid-cols-3">
        <Summary icon={<UserRound size={18} />} label="Clients" value={String(customers.length)} />
        <Summary icon={<ShoppingBag size={18} />} label="Achats" value={String(totalPurchases)} />
        <Summary icon={<ReceiptText size={18} />} label="Dépenses cumulées" value={formatMoney(totalRevenue, currency)} />
      </section>

      {errorMessage ? (
        <p className="mt-5 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {errorMessage}
        </p>
      ) : null}

      <label className="relative mt-6 block">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={19} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom, e-mail ou téléphone…"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none focus:border-brand"
        />
      </label>

      <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredCustomers.map((customer) => {
          const invoices = customer.invoices.filter(
            (invoice) => invoice.status === "issued",
          );
          const spending = invoices.reduce(
            (sum, invoice) => sum + invoice.total_amount,
            0,
          );

          return (
            <button
              type="button"
              key={customer.id}
              onClick={() => setSelected(customer)}
              className="rounded-2xl border border-border bg-surface p-5 text-left shadow-[0_10px_30px_rgb(57_45_30_/_4%)] transition hover:border-brand/35"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 font-semibold text-brand-strong">
                  {initials(customer.full_name)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{customer.full_name}</h2>
                  <p className="mt-1 truncate text-xs text-foreground/48">
                    {customer.email || customer.phone || "Aucune coordonnée"}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-surface-muted/55 p-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-wide text-foreground/42">Achats</p>
                  <p className="mt-1 font-mono font-semibold">{invoices.length}</p>
                </div>
                <div className="border-l border-border pl-3">
                  <p className="text-[0.65rem] uppercase tracking-wide text-foreground/42">Dépenses</p>
                  <p className="mt-1 font-mono text-sm font-semibold">{formatMoney(spending, currency)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {isAdding ? (
        <Modal title="Nouveau client" onClose={() => setIsAdding(false)}>
          <form onSubmit={addCustomer} className="space-y-4">
            <Field name="name" label="Nom complet *" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="email" label="E-mail" type="email" />
              <Field name="phone" label="Téléphone" type="tel" />
            </div>
            <label className="block text-sm font-semibold">
              Notes
              <textarea name="notes" rows={3} className={`${inputClass} mt-2 h-auto py-3`} placeholder="Préférences ou information utile…" />
            </label>
            <button disabled={pending} className="h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50">
              {pending ? "Création…" : "Créer le client"}
            </button>
          </form>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={selected.full_name} onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            {selected.email ? <Contact icon={<Mail size={16} />} value={selected.email} /> : null}
            {selected.phone ? <Contact icon={<Phone size={16} />} value={selected.phone} /> : null}
            {selected.notes ? <p className="rounded-xl bg-surface-muted p-3 text-foreground/60">{selected.notes}</p> : null}
          </div>
          <h3 className="mt-6 font-semibold">Historique des achats</h3>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {selected.invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted/55 p-3 text-sm">
                <div>
                  <p className="font-mono text-xs font-semibold">{invoice.invoice_number}</p>
                  <p className="mt-1 text-xs text-foreground/45">{formatDate(invoice.created_at)}</p>
                </div>
                <p className="font-mono font-semibold">{formatMoney(invoice.total_amount, currency)}</p>
              </div>
            ))}
            {!selected.invoices.length ? <p className="py-8 text-center text-sm text-foreground/45">Aucun achat enregistré.</p> : null}
          </div>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-sidebar/45 backdrop-blur-sm sm:place-items-center sm:p-4">
      <section role="dialog" aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-muted"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="rounded-2xl border border-border bg-surface p-4 sm:p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand-strong">{icon}</span><p className="mt-3 text-sm text-foreground/52">{label}</p><p className="mt-1 font-mono text-xl font-semibold">{value}</p></article>;
}

function Field({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block text-sm font-semibold">{label}<input name={name} type={type} required={required} className={`${inputClass} mt-2`} /></label>;
}

function Contact({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <p className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-foreground/65">{icon}<span className="break-all">{value}</span></p>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand";
