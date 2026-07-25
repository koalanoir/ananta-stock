-- Ananta Stock — rentabilité, facturation et réceptions fournisseurs

create type public.invoice_status as enum ('issued', 'cancelled');
create type public.delivery_status as enum ('pending', 'receiving', 'partial', 'completed', 'cancelled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  number text not null,
  customer_name text,
  customer_email text,
  status public.invoice_status not null default 'issued',
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete restrict,
  unique (organization_id, number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  label text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored
);

create table public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  number text not null,
  supplier_name text,
  status public.delivery_status not null default 'pending',
  created_by uuid not null references public.profiles(id) on delete restrict,
  validated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete restrict,
  unique (organization_id, number)
);

create table public.delivery_order_items (
  id uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.delivery_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  ordered_quantity numeric(14,3) not null check (ordered_quantity > 0),
  received_quantity numeric(14,3) check (received_quantity >= 0),
  comment text,
  validated_at timestamptz
);

create index invoices_store_created_idx on public.invoices(store_id, created_at desc);
create index delivery_orders_store_created_idx on public.delivery_orders(store_id, created_at desc);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;

create policy invoices_read on public.invoices for select using (public.can_access_store(organization_id, store_id));
create policy invoice_items_read on public.invoice_items for select using (exists (select 1 from public.invoices i where i.id = invoice_id and public.can_access_store(i.organization_id, i.store_id)));
create policy deliveries_read on public.delivery_orders for select using (public.can_access_store(organization_id, store_id));
create policy delivery_items_read on public.delivery_order_items for select using (exists (select 1 from public.delivery_orders d where d.id = delivery_order_id and public.can_access_store(d.organization_id, d.store_id)));

create or replace function public.create_invoice(invoice_customer_name text, invoice_customer_email text, invoice_lines jsonb, request_id uuid)
returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  membership public.memberships;
  result public.invoices;
  line jsonb;
  target_item public.items;
  current_quantity numeric(14,3);
  quantity_value numeric(14,3);
  total numeric(14,2) := 0;
  invoice_number text;
begin
  select * into membership from public.memberships where user_id = auth.uid() and active = true limit 1;
  if membership.user_id is null or membership.store_id is null then raise exception 'Permission denied'; end if;
  if jsonb_array_length(invoice_lines) = 0 then raise exception 'Invoice is empty'; end if;
  invoice_number := 'FAC-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(request_id::text,1,4));
  insert into public.invoices(organization_id, store_id, seller_id, number, customer_name, customer_email)
  values(membership.organization_id, membership.store_id, auth.uid(), invoice_number, nullif(trim(invoice_customer_name),''), nullif(lower(trim(invoice_customer_email)),'')) returning * into result;

  for line in select * from jsonb_array_elements(invoice_lines) loop
    select * into target_item from public.items where id = (line->>'item_id')::uuid and organization_id = membership.organization_id and store_id = membership.store_id and active = true and kind = 'commercialise';
    if target_item.id is null then raise exception 'Item not found'; end if;
    quantity_value := (line->>'quantity')::numeric;
    select quantity into current_quantity from public.stock_levels where item_id = target_item.id for update;
    if quantity_value <= 0 or current_quantity < quantity_value then raise exception 'Insufficient stock'; end if;
    insert into public.invoice_items(invoice_id,item_id,label,quantity,unit_price,unit_cost)
    values(result.id,target_item.id,trim(target_item.name || ' ' || target_item.brand),quantity_value,target_item.selling_price,target_item.unit_cost);
    total := total + quantity_value * target_item.selling_price;
    insert into public.inventory_movements(organization_id,store_id,item_id,type,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,created_by)
    values(membership.organization_id,membership.store_id,target_item.id,'vente',-quantity_value,current_quantity,current_quantity-quantity_value,'Facture '||invoice_number,gen_random_uuid(),auth.uid());
    update public.stock_levels set quantity=current_quantity-quantity_value,updated_at=now() where item_id=target_item.id;
  end loop;
  update public.invoices set total_amount=total where id=result.id returning * into result;
  return result;
end; $$;

create or replace function public.create_delivery_order(supplier text, delivery_lines jsonb, request_id uuid)
returns public.delivery_orders
language plpgsql security definer set search_path = '' as $$
declare membership public.memberships; result public.delivery_orders; line jsonb; target_item public.items;
begin
  select * into membership from public.memberships where user_id=auth.uid() and active=true limit 1;
  if membership.role not in ('owner','manager') or membership.store_id is null then raise exception 'Permission denied'; end if;
  insert into public.delivery_orders(organization_id,store_id,number,supplier_name,created_by)
  values(membership.organization_id,membership.store_id,'BL-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(request_id::text,1,4)),nullif(trim(supplier),''),auth.uid()) returning * into result;
  for line in select * from jsonb_array_elements(delivery_lines) loop
    select * into target_item from public.items where id=(line->>'item_id')::uuid and organization_id=membership.organization_id and store_id=membership.store_id and active=true;
    if target_item.id is null then raise exception 'Item not found'; end if;
    insert into public.delivery_order_items(delivery_order_id,item_id,ordered_quantity) values(result.id,target_item.id,(line->>'quantity')::numeric);
  end loop;
  return result;
end; $$;

create or replace function public.receive_delivery_order(target_order_id uuid, received_lines jsonb)
returns public.delivery_orders
language plpgsql security definer set search_path = '' as $$
declare membership public.memberships; result public.delivery_orders; line jsonb; order_line public.delivery_order_items; current_quantity numeric(14,3); received numeric(14,3); has_issue boolean:=false;
begin
  select * into membership from public.memberships where user_id=auth.uid() and active=true limit 1;
  select * into result from public.delivery_orders where id=target_order_id and public.can_access_store(organization_id,store_id) for update;
  if result.id is null or result.status in ('completed','cancelled') then raise exception 'Order unavailable'; end if;
  for line in select * from jsonb_array_elements(received_lines) loop
    select * into order_line from public.delivery_order_items where id=(line->>'line_id')::uuid and delivery_order_id=result.id for update;
    received := greatest(0,(line->>'received_quantity')::numeric);
    update public.delivery_order_items set received_quantity=received,comment=nullif(trim(line->>'comment'),''),validated_at=now() where id=order_line.id;
    if received <> order_line.ordered_quantity then has_issue:=true; end if;
    if received > 0 then
      select quantity into current_quantity from public.stock_levels where item_id=order_line.item_id for update;
      insert into public.inventory_movements(organization_id,store_id,item_id,type,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,created_by)
      values(result.organization_id,result.store_id,order_line.item_id,'entree',received,current_quantity,current_quantity+received,'Réception '||result.number,gen_random_uuid(),auth.uid());
      update public.stock_levels set quantity=current_quantity+received,updated_at=now() where item_id=order_line.item_id;
    end if;
  end loop;
  update public.delivery_orders set status=case when has_issue then 'partial'::public.delivery_status else 'completed'::public.delivery_status end,validated_by=auth.uid(),validated_at=now() where id=result.id returning * into result;
  return result;
end; $$;

grant execute on function public.create_invoice(text,text,jsonb,uuid) to authenticated;
grant execute on function public.create_delivery_order(text,jsonb,uuid) to authenticated;
grant execute on function public.receive_delivery_order(uuid,jsonb) to authenticated;