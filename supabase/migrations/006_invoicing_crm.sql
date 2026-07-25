-- Sprint 2 & 3: facturation multi-produits et CRM léger.

-- Rend l’onboarding robuste si stores.login_code est encore NOT NULL.
alter table public.stores
  alter column login_code
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text,
  phone text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create index if not exists customers_store_name_idx
  on public.customers (store_id, lower(full_name));

create unique index if not exists customers_store_email_unique_idx
  on public.customers (store_id, lower(email))
  where email is not null and trim(email) <> '';

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  invoice_number text not null,
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed', 'not_requested')),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete restrict,
  unique (store_id, invoice_number)
);

create index if not exists invoices_store_created_idx
  on public.invoices (store_id, created_at desc);

create index if not exists invoices_customer_idx
  on public.invoices (customer_id, created_at desc);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items (invoice_id);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute procedure public.set_updated_at();

alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

drop policy if exists customers_select_store on public.customers;
create policy customers_select_store
on public.customers for select
to authenticated
using (public.can_access_store(organization_id, store_id));

drop policy if exists customers_insert_store on public.customers;
create policy customers_insert_store
on public.customers for insert
to authenticated
with check (
  public.can_access_store(organization_id, store_id)
  and created_by = (select auth.uid())
);

drop policy if exists customers_update_store on public.customers;
create policy customers_update_store
on public.customers for update
to authenticated
using (public.can_access_store(organization_id, store_id))
with check (public.can_access_store(organization_id, store_id));

drop policy if exists customers_delete_manager on public.customers;
create policy customers_delete_manager
on public.customers for delete
to authenticated
using (public.can_manage_catalog(organization_id));

drop policy if exists invoices_select_store on public.invoices;
create policy invoices_select_store
on public.invoices for select
to authenticated
using (
  public.can_access_store(organization_id, store_id)
  and (
    public.can_manage_catalog(organization_id)
    or seller_id = (select auth.uid())
  )
);

drop policy if exists invoice_items_select_store on public.invoice_items;
create policy invoice_items_select_store
on public.invoice_items for select
to authenticated
using (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and public.can_access_store(invoice.organization_id, invoice.store_id)
      and (
        public.can_manage_catalog(invoice.organization_id)
        or invoice.seller_id = (select auth.uid())
      )
  )
);

create or replace function public.create_customer(
  target_store_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_notes text
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  result public.customers;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_store
  from public.stores
  where id = target_store_id and active = true;

  if target_store.id is null
    or not public.can_access_store(target_store.organization_id, target_store.id)
  then
    raise exception 'Store not found';
  end if;

  if char_length(trim(customer_name)) < 2 then
    raise exception 'Customer name is required';
  end if;

  if nullif(lower(trim(customer_email)), '') is not null then
    select * into result
    from public.customers
    where store_id = target_store.id
      and lower(email) = lower(trim(customer_email))
    limit 1;
  end if;

  if result.id is not null then
    update public.customers
    set
      full_name = trim(customer_name),
      phone = coalesce(nullif(trim(customer_phone), ''), phone),
      notes = coalesce(nullif(trim(customer_notes), ''), notes)
    where id = result.id
    returning * into result;
    return result;
  end if;

  insert into public.customers (
    organization_id, store_id, full_name, email, phone, notes, created_by
  )
  values (
    target_store.organization_id,
    target_store.id,
    trim(customer_name),
    nullif(lower(trim(customer_email)), ''),
    nullif(trim(customer_phone), ''),
    nullif(trim(customer_notes), ''),
    auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.create_invoice(
  target_store_id uuid,
  target_customer_id uuid,
  customer_data jsonb,
  cart_items jsonb,
  request_id uuid
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  target_customer public.customers;
  target_item public.items;
  current_quantity numeric(14,3);
  cart_line jsonb;
  line_quantity numeric(14,3);
  invoice_total numeric(14,2) := 0;
  result public.invoices;
  result_sale public.sales;
  generated_number text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_store
  from public.stores
  where id = target_store_id and active = true;

  if target_store.id is null
    or not public.can_access_store(target_store.organization_id, target_store.id)
  then
    raise exception 'Store not found';
  end if;

  select invoice.* into result
  from public.invoices invoice
  join public.sales sale on sale.id = invoice.sale_id
  where invoice.organization_id = target_store.organization_id
    and sale.idempotency_key = request_id;

  if result.id is not null then
    return result;
  end if;

  if jsonb_typeof(cart_items) <> 'array'
    or jsonb_array_length(cart_items) = 0
  then
    raise exception 'Cart is empty';
  end if;

  if target_customer_id is not null then
    select * into target_customer
    from public.customers
    where id = target_customer_id
      and organization_id = target_store.organization_id
      and store_id = target_store.id;

    if target_customer.id is null then
      raise exception 'Customer not found';
    end if;
  else
    target_customer := public.create_customer(
      target_store.id,
      customer_data ->> 'full_name',
      customer_data ->> 'email',
      customer_data ->> 'phone',
      customer_data ->> 'notes'
    );
  end if;

  -- Verrouille et valide toutes les lignes avant toute écriture métier.
  for cart_line in select * from jsonb_array_elements(cart_items)
  loop
    line_quantity := (cart_line ->> 'quantity')::numeric;

    if line_quantity <= 0 then
      raise exception 'Quantity must be positive';
    end if;

    select * into target_item
    from public.items
    where id = (cart_line ->> 'item_id')::uuid
      and store_id = target_store.id
      and organization_id = target_store.organization_id
      and kind = 'commercialise'
      and active = true;

    if target_item.id is null then
      raise exception 'Item not found';
    end if;

    select quantity into current_quantity
    from public.stock_levels
    where item_id = target_item.id
    for update;

    if current_quantity < line_quantity then
      raise exception 'Insufficient stock for %', target_item.name;
    end if;

    invoice_total := invoice_total + (line_quantity * target_item.selling_price);
  end loop;

  insert into public.sales (
    organization_id, store_id, seller_id, total_amount, idempotency_key
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    invoice_total,
    request_id
  )
  returning * into result_sale;

  generated_number :=
    'FAC-' || to_char(now() at time zone target_store.timezone, 'YYYYMMDD')
    || '-' || upper(substr(replace(request_id::text, '-', ''), 1, 6));

  insert into public.invoices (
    organization_id, store_id, sale_id, customer_id, seller_id,
    invoice_number, subtotal, total_amount,
    email_status
  )
  values (
    target_store.organization_id,
    target_store.id,
    result_sale.id,
    target_customer.id,
    auth.uid(),
    generated_number,
    invoice_total,
    invoice_total,
    case when target_customer.email is null then 'not_requested' else 'pending' end
  )
  returning * into result;

  for cart_line in select * from jsonb_array_elements(cart_items)
  loop
    line_quantity := (cart_line ->> 'quantity')::numeric;

    select * into target_item
    from public.items
    where id = (cart_line ->> 'item_id')::uuid;

    select quantity into current_quantity
    from public.stock_levels
    where item_id = target_item.id
    for update;

    insert into public.sale_items (
      sale_id, item_id, quantity, unit_price, unit_cost_snapshot
    )
    values (
      result_sale.id,
      target_item.id,
      line_quantity,
      target_item.selling_price,
      target_item.unit_cost
    );

    insert into public.invoice_items (
      invoice_id, item_id, description, quantity, unit_price
    )
    values (
      result.id,
      target_item.id,
      trim(target_item.name || ' ' || target_item.brand),
      line_quantity,
      target_item.selling_price
    );

    insert into public.inventory_movements (
      organization_id, store_id, item_id, sale_id, type,
      quantity_delta, quantity_before, quantity_after,
      reason, idempotency_key, created_by
    )
    values (
      target_store.organization_id,
      target_store.id,
      target_item.id,
      result_sale.id,
      'vente',
      -line_quantity,
      current_quantity,
      current_quantity - line_quantity,
      'Facture ' || generated_number,
      public.gen_random_uuid(),
      auth.uid()
    );

    update public.stock_levels
    set quantity = current_quantity - line_quantity, updated_at = now()
    where item_id = target_item.id;
  end loop;

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    'sale',
    jsonb_build_object(
      'sale_id', result_sale.id,
      'invoice_id', result.id,
      'invoice_number', generated_number,
      'amount', invoice_total,
      'customer_id', target_customer.id
    )
  );

  return result;
end;
$$;

create or replace function public.mark_invoice_email(
  target_invoice_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invoice public.invoices;
begin
  select * into target_invoice
  from public.invoices
  where id = target_invoice_id;

  if target_invoice.id is null
    or not public.can_access_store(
      target_invoice.organization_id,
      target_invoice.store_id
    )
  then
    raise exception 'Invoice not found';
  end if;

  if new_status not in ('sent', 'failed', 'pending', 'not_requested') then
    raise exception 'Invalid email status';
  end if;

  update public.invoices
  set
    email_status = new_status,
    email_sent_at = case when new_status = 'sent' then now() else email_sent_at end
  where id = target_invoice.id;
end;
$$;

revoke all on table public.customers from anon;
revoke all on table public.invoices from anon;
revoke all on table public.invoice_items from anon;
grant select on table public.customers to authenticated;
grant select on table public.invoices to authenticated;
grant select on table public.invoice_items to authenticated;

revoke all on function public.create_customer(uuid, text, text, text, text) from public;
grant execute on function public.create_customer(uuid, text, text, text, text) to authenticated;

revoke all on function public.create_invoice(uuid, uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.create_invoice(uuid, uuid, jsonb, jsonb, uuid) to authenticated;

revoke all on function public.mark_invoice_email(uuid, text) from public;
grant execute on function public.mark_invoice_email(uuid, text) to authenticated;
