"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, ChefHat, CirclePlus, Clock3, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrency, type UserRole } from "@/lib/types";
import type { RestaurantOrder } from "@/lib/restaurant";

const labels = { waiting:"En attente de préparation", preparing:"En cours de préparation", ready:"Prête à servir", served:"Servie", cancelled:"Annulée" };
const nextStatus = { waiting:"preparing", preparing:"ready", ready:"served" } as const;
const nextLabels = { waiting:"Démarrer", preparing:"Marquer prête", ready:"Marquer servie" };
const styles = { waiting:"bg-warning/10 text-warning", preparing:"bg-brand/10 text-brand-strong", ready:"bg-success/10 text-success", served:"bg-surface-muted text-foreground/60", cancelled:"bg-danger/10 text-danger" };

export function RestaurantOrdersClient({role,storeId,storeName,currency,userName,initialOrders}:{role:UserRole;storeId:string;storeName:string;currency:string;userName:string;initialOrders:RestaurantOrder[]}) {
  const router=useRouter();const [filter,setFilter]=useState<"active"|"waiting"|"preparing"|"ready"|"served">("active");const [pendingId,setPendingId]=useState("");const [error,setError]=useState("");
  const orders=useMemo(()=>initialOrders.filter((order)=>filter==="active"?order.preparation_status!=="cancelled"&&(order.preparation_status!=="served"||order.payment_status==="unpaid"):order.preparation_status===filter),[initialOrders,filter]);
  useEffect(()=>{
    const supabase=getSupabaseBrowserClient();if(!supabase)return;
    const channel=supabase.channel(`restaurant-orders-${storeId}`).on("postgres_changes",{event:"*",schema:"public",table:"customer_orders",filter:`store_id=eq.${storeId}`},()=>router.refresh()).subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[router,storeId]);
  async function advance(order:RestaurantOrder){
    const target=nextStatus[order.preparation_status as keyof typeof nextStatus];if(!target)return;
    const supabase=getSupabaseBrowserClient();if(!supabase)return setError("Supabase n’est pas configuré.");
    setPendingId(order.id);setError("");const {error:rpcError}=await supabase.rpc("set_customer_order_status",{target_customer_order_id:order.id,new_status:target});setPendingId("");if(rpcError)return setError(rpcError.message);router.refresh();
  }
  async function pay(order:RestaurantOrder){
    if(!window.confirm(`Valider le paiement de ${formatCurrency(total(order),currency)} ? Le ticket sera créé et les ingrédients déduits.`))return;
    const supabase=getSupabaseBrowserClient();if(!supabase)return setError("Supabase n’est pas configuré.");
    setPendingId(order.id);setError("");const {data,error:rpcError}=await supabase.rpc("pay_customer_order",{target_customer_order_id:order.id,target_customer_id:null,customer_data:{},operation_id:crypto.randomUUID()});setPendingId("");
    if(rpcError)return setError(rpcError.message);const invoice=(data as {id?:string}|null)?.id;router.refresh();if(invoice)router.push(`/invoices?invoice=${invoice}`);
  }
  return <AppShell active="restaurant-orders" role={role} storeName={storeName} userName={userName} businessType="restaurant">
    <PageHeading eyebrow="Service en temps réel" title="Commandes clients" description="Suivez la préparation, le service et le paiement. Les statuts se synchronisent automatiquement pour toute l’équipe." action={<Link href="/pos" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white"><CirclePlus size={18}/> Nouvelle commande</Link>}/>
    {error?<p className="mt-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>:null}
    <div className="mt-7 flex gap-2 overflow-x-auto pb-1">{(["active","waiting","preparing","ready","served"] as const).map((key)=><button key={key} onClick={()=>setFilter(key)} className={`h-10 shrink-0 rounded-xl border px-4 text-sm font-semibold ${filter===key?"border-sidebar bg-sidebar text-white":"border-border bg-surface"}`}>{key==="active"?"À traiter":labels[key]}</button>)}</div>
    <section className="mt-5 grid gap-4 lg:grid-cols-2">{orders.map((order)=><article key={order.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-sm font-semibold">{order.order_number}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[order.preparation_status]}`}>{labels[order.preparation_status]}</span></div><p className="mt-2 text-lg font-semibold">{order.table_reference || "Sans table · comptoir"}</p><p className="mt-1 text-xs text-foreground/45">Créée {new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(new Date(order.created_at))}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.payment_status==="paid"?"bg-success/10 text-success":"bg-danger/10 text-danger"}`}>{order.payment_status==="paid"?"Payée":"Non payée"}</span></div>
      <div className="mt-4 divide-y divide-border rounded-xl bg-surface-muted/45 px-3">{order.customer_order_items.map((line)=><div key={line.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><b>{line.quantity}×</b> {line.menu_item?.name??"Article"}</span><span className="font-mono">{formatCurrency(line.line_total,currency)}</span></div>)}</div>
      <div className="mt-4 flex items-center justify-between"><span className="font-semibold">Total</span><span className="font-mono text-lg font-semibold">{formatCurrency(total(order),currency)}</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{order.preparation_status in nextStatus?<button disabled={pendingId===order.id} onClick={()=>advance(order)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold disabled:opacity-50">{icon(order.preparation_status)}{nextLabels[order.preparation_status as keyof typeof nextLabels]}</button>:<div/>}{order.payment_status==="unpaid"?<button disabled={pendingId===order.id} onClick={()=>pay(order)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"><Banknote size={17}/> Encaisser</button>:<Link href={`/invoices?invoice=${order.invoice_id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-success/25 text-sm font-semibold text-success"><CheckCircle2 size={17}/> Voir le ticket</Link>}</div>
    </article>)}</section>
    {!orders.length?<p className="py-20 text-center text-sm text-foreground/50">Aucune commande dans cette vue.</p>:null}
  </AppShell>;
}
function total(order:RestaurantOrder){return order.customer_order_items.reduce((sum,line)=>sum+line.line_total,0);}
function icon(status:RestaurantOrder["preparation_status"]){if(status==="waiting")return <ChefHat size={17}/>;if(status==="preparing")return <Clock3 size={17}/>;return <Utensils size={17}/>;}
