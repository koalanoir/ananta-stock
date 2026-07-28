"use client";

import { useMemo, useState } from "react";
import { Building2, LoaderCircle, LogOut, Save, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { ACCOUNT_FEATURES, type FeatureFlags } from "@/lib/account-features";

export type AdminAccount = {
  id: string;
  name: string;
  subscriptionStatus: string;
  createdAt: string;
  storeId: string;
  storeName: string;
  businessType: "retail" | "restaurant";
  maxSellers: number;
  retainCustomerOrders: boolean;
  retainInvoices: boolean;
  featureFlags: FeatureFlags;
  sellerCount: number;
  memberCount: number;
};

export function AdminDashboardClient({ initialAccounts }: { initialAccounts: AdminAccount[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(
    () => accounts.filter((account) => `${account.name} ${account.storeName}`.toLowerCase().includes(query.toLowerCase())),
    [accounts, query],
  );

  function update(id: string, patch: Partial<AdminAccount>) {
    setAccounts((current) => current.map((account) => account.id === id ? { ...account, ...patch } : account));
  }

  async function save(account: AdminAccount) {
    setPendingId(account.id); setError(""); setMessage("");
    const response = await fetch(`/api/platform-admin/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: account.storeId,
        businessType: account.businessType,
        maxSellers: account.maxSellers,
        retainCustomerOrders: account.retainCustomerOrders,
        retainInvoices: account.retainInvoices,
        featureFlags: account.featureFlags,
      }),
    });
    const result = await response.json() as { error?: string; settings?: Partial<AdminAccount> };
    setPendingId("");
    if (!response.ok) return setError(result.error ?? "Enregistrement impossible.");
    if (result.settings) update(account.id, result.settings);
    setMessage(`Configuration de ${account.name} enregistrée.`);
  }

  async function remove(account: AdminAccount) {
    const confirmation = window.prompt(`Cette action supprime définitivement ${account.name}, ses boutiques, utilisateurs et données. Tapez SUPPRIMER pour confirmer.`);
    if (confirmation !== "SUPPRIMER") return;
    setPendingId(account.id); setError(""); setMessage("");
    const response = await fetch(`/api/platform-admin/accounts/${account.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    setPendingId("");
    if (!response.ok) return setError(result.error ?? "Suppression impossible.");
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    setMessage(`${account.name} a été supprimé.`);
  }

  async function logout() {
    await fetch("/api/platform-admin/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f5f7f6]">
      <header className="sticky top-0 z-20 border-b border-black/8 bg-sidebar text-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3"><ShieldCheck className="text-[#e9b18d]" size={24} /><div><p className="font-bold tracking-[0.1em]">ANANTA ADMIN</p><p className="text-xs text-white/50">Configuration de la plateforme</p></div></div>
          <button onClick={logout} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold hover:bg-white/8"><LogOut size={16} /> Déconnexion</button>
        </div>
      </header>
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <Summary icon={<Building2 size={19} />} label="Comptes" value={String(accounts.length)} />
          <Summary icon={<Users size={19} />} label="Utilisateurs" value={String(accounts.reduce((sum, account) => sum + account.memberCount, 0))} />
          <Summary icon={<ShieldCheck size={19} />} label="Fonctions configurables" value={String(ACCOUNT_FEATURES.length)} />
        </div>
        <label className="relative mt-6 block"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une entreprise ou une boutique…" className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 outline-none focus:border-brand" /></label>
        {message ? <p className="mt-5 rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">{message}</p> : null}
        {error ? <p className="mt-5 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</p> : null}
        <section className="mt-5 space-y-5">
          {filtered.map((account) => (
            <article key={account.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-strong">{account.subscriptionStatus}</p><h2 className="mt-2 text-xl font-semibold">{account.name}</h2><p className="mt-1 text-sm text-foreground/50">{account.storeName} · {account.memberCount} membre{account.memberCount > 1 ? "s" : ""}</p></div>
                <button disabled={pendingId === account.id} onClick={() => remove(account)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/25 px-3 text-xs font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"><Trash2 size={15} /> Supprimer le compte</button>
              </div>
              <div className="mt-5 grid gap-4 border-t border-border pt-5 lg:grid-cols-3">
                <label className="text-sm font-semibold">Type d’activité<select value={account.businessType} onChange={(event) => update(account.id, { businessType: event.target.value as AdminAccount["businessType"] })} className={fieldClass}><option value="retail">Commerce / épicerie</option><option value="restaurant">Restaurant / bar</option></select></label>
                <label className="text-sm font-semibold">Nombre maximal de vendeurs<input type="number" min="0" max="500" value={account.maxSellers} onChange={(event) => update(account.id, { maxSellers: Number(event.target.value) })} className={fieldClass} /><span className="mt-1 block text-xs font-normal text-foreground/45">{account.sellerCount} actuellement</span></label>
                <div><p className="text-sm font-semibold">Conservation des données</p><Toggle checked={account.retainCustomerOrders} onChange={(value) => update(account.id, { retainCustomerOrders: value })} label="Commandes clients" /><Toggle checked={account.retainInvoices} onChange={(value) => update(account.id, { retainInvoices: value })} label="Factures" /></div>
              </div>
              <div className="mt-5 border-t border-border pt-5"><h3 className="font-semibold">Fonctionnalités autorisées</h3><p className="mt-1 text-xs text-foreground/45">Les onglets désactivés sont masqués et leurs routes sont bloquées.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ACCOUNT_FEATURES.map((feature) => <Toggle key={feature.key} checked={account.featureFlags[feature.key]} onChange={(value) => update(account.id, { featureFlags: { ...account.featureFlags, [feature.key]: value } })} label={feature.label} />)}</div></div>
              <button disabled={pendingId === account.id || !account.storeId} onClick={() => save(account)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50">{pendingId === account.id ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} Enregistrer</button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /></label>;
}
function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="rounded-2xl border border-border bg-surface p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand-strong">{icon}</span><p className="mt-4 text-sm text-foreground/50">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>;
}
const fieldClass = "mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-brand";
