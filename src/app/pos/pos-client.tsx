"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrency, type UserRole } from "@/lib/types";
import type { MenuItemSummary } from "@/lib/restaurant";

const typeLabels = { dish: "Plats", cocktail: "Cocktails", drink: "Boissons", other: "Autres" };

export function PosClient({ role, storeId, storeName, currency, userName, menu }: {
  role: UserRole; storeId: string; storeName: string; currency: string; userName: string; menu: MenuItemSummary[];
}) {
  const router = useRouter(); const [query,setQuery]=useState(""); const [type,setType]=useState("all");
  const [table,setTable]=useState(""); const [cart,setCart]=useState<Record<string,number>>({}); const [pending,setPending]=useState(false); const [error,setError]=useState("");
  const filtered = useMemo(() => menu.filter((item) => (type==="all" || item.type===type) && `${item.name} ${item.description??""}`.toLowerCase().includes(query.toLowerCase())),[menu,query,type]);
  const cartLines = menu.filter((item)=>cart[item.id]).map((item)=>({...item,quantity:cart[item.id]}));
  const total = cartLines.reduce((sum,item)=>sum+item.selling_price*item.quantity,0);
  function change(id:string,value:number){setCart((current)=>{const next={...current};if(value<=0)delete next[id];else next[id]=value;return next;});}
  async function submit(){
    if(!cartLines.length)return setError("Ajoutez au moins un produit.");
    const supabase=getSupabaseBrowserClient();if(!supabase)return setError("Supabase n’est pas configuré.");
    setPending(true);setError("");
    const {error:rpcError}=await supabase.rpc("create_customer_order",{target_store_id:storeId,target_table_reference:table,order_lines:cartLines.map((item)=>({menu_item_id:item.id,quantity:item.quantity})),operation_id:crypto.randomUUID()});
    setPending(false);if(rpcError)return setError(rpcError.message);router.push("/restaurant-orders");router.refresh();
  }
  return <AppShell active="pos" role={role} storeName={storeName} userName={userName}>
    <PageHeading eyebrow="Caisse restaurant" title="Nouvelle commande" description="Composez la commande du client. La table est facultative et peut contenir un numéro, un nom ou « à emporter »."/>
    <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_360px]">
      <section>
        <label className="relative block"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Rechercher un plat ou une boisson…" className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 outline-none focus:border-brand"/></label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{["all","dish","cocktail","drink","other"].map((key)=><button key={key} onClick={()=>setType(key)} className={`h-10 shrink-0 rounded-xl border px-4 text-sm font-semibold ${type===key?"border-sidebar bg-sidebar text-white":"border-border bg-surface"}`}>{key==="all"?"Tout":typeLabels[key as keyof typeof typeLabels]}</button>)}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item)=><article key={item.id} className="flex min-h-40 flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">{typeLabels[item.type]}</p><h2 className="mt-2 font-semibold">{item.name}</h2>{item.description?<p className="mt-1 line-clamp-2 text-xs text-foreground/50">{item.description}</p>:null}<div className="mt-auto flex items-end justify-between gap-3 pt-4"><span className="font-mono font-semibold">{formatCurrency(item.selling_price,currency)}</span><button onClick={()=>change(item.id,(cart[item.id]??0)+1)} className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar text-white" aria-label={`Ajouter ${item.name}`}><Plus size={18}/></button></div></article>)}</div>
        {!filtered.length?<p className="py-16 text-center text-sm text-foreground/50">Aucun article dans cette catégorie.</p>:null}
      </section>
      <aside className="h-fit rounded-2xl border border-border bg-surface p-4 shadow-sm xl:sticky xl:top-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShoppingBag size={19}/> Commande</h2>
        <label className="mt-4 block text-sm font-semibold">Table / référence (optionnel)<input value={table} onChange={(e)=>setTable(e.target.value)} placeholder="Table 02, terrasse, à emporter…" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-brand"/></label>
        <div className="mt-4 divide-y divide-border">{cartLines.map((item)=><div key={item.id} className="py-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{item.name}</p><p className="font-mono text-sm">{formatCurrency(item.selling_price*item.quantity,currency)}</p></div><div className="mt-2 flex h-9 w-fit items-center rounded-lg border border-border"><button onClick={()=>change(item.id,item.quantity-1)} className="grid h-full w-9 place-items-center"><Minus size={14}/></button><span className="w-8 text-center font-mono text-sm font-semibold">{item.quantity}</span><button onClick={()=>change(item.id,item.quantity+1)} className="grid h-full w-9 place-items-center"><Plus size={14}/></button></div></div>)}</div>
        {!cartLines.length?<p className="py-8 text-center text-sm text-foreground/45">Le panier est vide.</p>:null}
        <div className="flex items-center justify-between border-t border-border pt-4 text-lg font-semibold"><span>Total</span><span className="font-mono">{formatCurrency(total,currency)}</span></div>
        {error?<p className="mt-3 text-sm text-danger">{error}</p>:null}
        <button disabled={pending||!cartLines.length} onClick={submit} className="mt-4 h-12 w-full rounded-xl bg-brand font-semibold text-white disabled:opacity-40">{pending?"Envoi…":"Envoyer en préparation"}</button>
      </aside>
    </div>
  </AppShell>;
}
