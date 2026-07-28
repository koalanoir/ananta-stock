-- Mode restaurant, caisse temps réel et clôture des réceptions partielles.
-- À exécuter après 008_supplier_orders_and_receipts.sql.

alter table public.stores
  add column if not exists business_type text not null default 'retail'
  check (business_type in ('retail', 'restaurant'));

alter table public.purchase_orders
  add column if not exists closed_incomplete boolean not null default false,
  add column if not exists closed_at timestamptz,
  add column if not exists closure_comment text;

create type public.menu_item_type as enum ('dish', 'cocktail', 'drink', 'other');
create type public.preparation_status as enum (
  'waiting',
  'preparing',
  'ready',
  'served',
  'cancelled'
);
create type public.payment_status as enum ('unpaid', 'paid');

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  type public.menu_item_type not null default 'dish',
  selling_price numeric(14,2) not null check (selling_price >= 0),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  unique (store_id, name)
);

create table public.menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity_required numeric(14,3) not null check (quantity_required > 0),
  created_at timestamptz not null default now(),
  unique (menu_item_id, item_id)
);

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_number text not null,
  table_reference text,
  preparation_status public.preparation_status not null default 'waiting',
  payment_status public.payment_status not null default 'unpaid',
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  paid_by uuid references public.profiles(id) on delete restrict,
  paid_at timestamptz,
  invoice_id uuid references public.invoices(id) on delete set null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  unique (store_id, order_number),
  unique (organization_id, request_id)
);

create table public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  customer_order_id uuid not null references public.customer_orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  unique (customer_order_id, menu_item_id)
);

alter table public.sale_items
  alter column item_id drop not null,
  add column if not exists menu_item_id uuid references public.menu_items(id) on delete restrict;

alter table public.invoice_items
  alter column item_id drop not null,
  add column if not exists menu_item_id uuid references public.menu_items(id) on delete restrict;

alter table public.invoices
  add column if not exists customer_order_id uuid unique
    references public.customer_orders(id) on delete set null,
  add column if not exists table_reference text;

create index menu_items_store_active_idx
  on public.menu_items (store_id, active, name);
create index customer_orders_store_status_idx
  on public.customer_orders (store_id, preparation_status, payment_status, created_at desc);

create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute procedure public.set_updated_at();

create trigger customer_orders_set_updated_at
before update on public.customer_orders
for each row execute procedure public.set_updated_at();

alter table public.menu_items enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;

create policy menu_items_select_store on public.menu_items
for select to authenticated
using (public.can_access_store(organization_id, store_id));

create policy menu_item_ingredients_select_store on public.menu_item_ingredients
for select to authenticated
using (
  exists (
    select 1 from public.menu_items menu_item
    where menu_item.id = menu_item_ingredients.menu_item_id
      and public.can_access_store(menu_item.organization_id, menu_item.store_id)
  )
);

create policy customer_orders_select_store on public.customer_orders
for select to authenticated
using (public.can_access_store(organization_id, store_id));

create policy customer_order_items_select_store on public.customer_order_items
for select to authenticated
using (
  exists (
    select 1 from public.customer_orders customer_order
    where customer_order.id = customer_order_items.customer_order_id
      and public.can_access_store(customer_order.organization_id, customer_order.store_id)
  )
);

create or replace function public.set_store_business_type(
  target_store_id uuid,
  new_business_type text
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.stores;
begin
  select * into result from public.stores where id = target_store_id;
  if result.id is null or not public.can_manage_catalog(result.organization_id) then
    raise exception 'Permission denied';
  end if;
  if new_business_type not in ('retail', 'restaurant') then
    raise exception 'Invalid business type';
  end if;
  update public.stores set business_type = new_business_type
  where id = target_store_id returning * into result;
  return result;
end;
$$;

create or replace function public.save_menu_item(
  target_store_id uuid,
  target_menu_item_id uuid,
  menu_data jsonb,
  ingredient_lines jsonb
)
returns public.menu_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  target_ingredient public.items;
  result public.menu_items;
  line jsonb;
begin
  select * into target_store from public.stores
  where id = target_store_id and active = true;
  if auth.uid() is null or target_store.id is null
    or not public.can_manage_catalog(target_store.organization_id) then
    raise exception 'Permission denied';
  end if;
  if char_length(trim(coalesce(menu_data ->> 'name', ''))) < 2 then
    raise exception 'Name is required';
  end if;
  if coalesce((menu_data ->> 'selling_price')::numeric, -1) < 0 then
    raise exception 'Invalid price';
  end if;
  if jsonb_typeof(ingredient_lines) <> 'array'
    or jsonb_array_length(ingredient_lines) = 0 then
    raise exception 'At least one ingredient is required';
  end if;

  if target_menu_item_id is null then
    insert into public.menu_items (
      organization_id, store_id, name, description, type,
      selling_price, created_by
    ) values (
      target_store.organization_id, target_store.id,
      trim(menu_data ->> 'name'),
      nullif(trim(menu_data ->> 'description'), ''),
      (menu_data ->> 'type')::public.menu_item_type,
      (menu_data ->> 'selling_price')::numeric,
      auth.uid()
    ) returning * into result;
  else
    update public.menu_items set
      name = trim(menu_data ->> 'name'),
      description = nullif(trim(menu_data ->> 'description'), ''),
      type = (menu_data ->> 'type')::public.menu_item_type,
      selling_price = (menu_data ->> 'selling_price')::numeric,
      active = coalesce((menu_data ->> 'active')::boolean, active)
    where id = target_menu_item_id
      and store_id = target_store.id
    returning * into result;
    if result.id is null then raise exception 'Menu item not found'; end if;
    delete from public.menu_item_ingredients where menu_item_id = result.id;
  end if;

  for line in select * from jsonb_array_elements(ingredient_lines)
  loop
    select * into target_ingredient from public.items
    where id = (line ->> 'item_id')::uuid
      and store_id = target_store.id
      and organization_id = target_store.organization_id
      and kind = 'outil'
      and active = true;
    if target_ingredient.id is null then
      raise exception 'Ingredient not found';
    end if;
    insert into public.menu_item_ingredients (
      menu_item_id, item_id, quantity_required
    ) values (
      result.id, target_ingredient.id,
      (line ->> 'quantity')::numeric
    );
  end loop;
  return result;
end;
$$;

create or replace function public.create_customer_order(
  target_store_id uuid,
  target_table_reference text,
  order_lines jsonb,
  operation_id uuid
)
returns public.customer_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  target_menu_item public.menu_items;
  result public.customer_orders;
  line jsonb;
  generated_number text;
begin
  select * into target_store from public.stores
  where id = target_store_id and active = true;
  if auth.uid() is null or target_store.id is null
    or not public.can_access_store(target_store.organization_id, target_store.id) then
    raise exception 'Store not found';
  end if;
  select * into result from public.customer_orders
  where organization_id = target_store.organization_id and request_id = operation_id;
  if result.id is not null then return result; end if;
  if jsonb_typeof(order_lines) <> 'array' or jsonb_array_length(order_lines) = 0 then
    raise exception 'Order is empty';
  end if;
  generated_number := 'CLI-' || to_char(now() at time zone target_store.timezone, 'YYYYMMDD')
    || '-' || upper(substr(replace(operation_id::text, '-', ''), 1, 6));
  insert into public.customer_orders (
    organization_id, store_id, order_number, table_reference, created_by, request_id
  ) values (
    target_store.organization_id, target_store.id, generated_number,
    nullif(trim(target_table_reference), ''), auth.uid(), operation_id
  ) returning * into result;
  for line in select * from jsonb_array_elements(order_lines)
  loop
    select * into target_menu_item from public.menu_items
    where id = (line ->> 'menu_item_id')::uuid
      and store_id = target_store.id and active = true;
    if target_menu_item.id is null then raise exception 'Menu item not found'; end if;
    insert into public.customer_order_items (
      customer_order_id, menu_item_id, quantity, unit_price
    ) values (
      result.id, target_menu_item.id,
      (line ->> 'quantity')::numeric, target_menu_item.selling_price
    );
  end loop;
  return result;
end;
$$;

create or replace function public.set_customer_order_status(
  target_customer_order_id uuid,
  new_status public.preparation_status
)
returns public.customer_orders
language plpgsql
security definer
set search_path = ''
as $$
declare result public.customer_orders;
begin
  select * into result from public.customer_orders
  where id = target_customer_order_id for update;
  if auth.uid() is null or result.id is null
    or not public.can_access_store(result.organization_id, result.store_id) then
    raise exception 'Order not found';
  end if;
  if (result.preparation_status = 'waiting' and new_status not in ('preparing', 'cancelled'))
    or (result.preparation_status = 'preparing' and new_status not in ('ready', 'cancelled'))
    or (result.preparation_status = 'ready' and new_status <> 'served')
    or result.preparation_status in ('served', 'cancelled') then
    raise exception 'Invalid status transition';
  end if;
  update public.customer_orders set preparation_status = new_status
  where id = result.id returning * into result;
  return result;
end;
$$;

create or replace function public.pay_customer_order(
  target_customer_order_id uuid,
  target_customer_id uuid,
  customer_data jsonb,
  operation_id uuid
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.customer_orders;
  target_store public.stores;
  target_customer public.customers;
  result public.invoices;
  result_sale public.sales;
  order_line record;
  ingredient_line record;
  current_quantity numeric(14,3);
  invoice_total numeric(14,2);
  generated_number text;
begin
  select * into target_order from public.customer_orders
  where id = target_customer_order_id for update;
  if auth.uid() is null or target_order.id is null
    or not public.can_access_store(target_order.organization_id, target_order.store_id) then
    raise exception 'Order not found';
  end if;
  if target_order.payment_status = 'paid' then
    select * into result from public.invoices where id = target_order.invoice_id;
    return result;
  end if;
  if target_order.preparation_status = 'cancelled' then
    raise exception 'Cancelled order cannot be paid';
  end if;
  select * into target_store from public.stores where id = target_order.store_id;

  if exists (
    select 1
    from (
      select recipe.item_id,
        sum(recipe.quantity_required * order_item.quantity) required_quantity
      from public.customer_order_items order_item
      join public.menu_item_ingredients recipe
        on recipe.menu_item_id = order_item.menu_item_id
      where order_item.customer_order_id = target_order.id
      group by recipe.item_id
    ) required
    join public.stock_levels stock on stock.item_id = required.item_id
    where stock.quantity < required.required_quantity
  ) then
    raise exception 'Insufficient ingredient stock';
  end if;

  if target_customer_id is not null then
    select * into target_customer from public.customers
    where id = target_customer_id and store_id = target_order.store_id;
  elsif char_length(trim(coalesce(customer_data ->> 'full_name', ''))) >= 2 then
    target_customer := public.create_customer(
      target_order.store_id,
      customer_data ->> 'full_name',
      customer_data ->> 'email',
      customer_data ->> 'phone',
      customer_data ->> 'notes'
    );
  end if;

  select coalesce(sum(line_total), 0) into invoice_total
  from public.customer_order_items where customer_order_id = target_order.id;
  insert into public.sales (
    organization_id, store_id, seller_id, total_amount, idempotency_key
  ) values (
    target_order.organization_id, target_order.store_id,
    auth.uid(), invoice_total, operation_id
  ) returning * into result_sale;
  generated_number := 'FAC-' || to_char(now() at time zone target_store.timezone, 'YYYYMMDD')
    || '-' || upper(substr(replace(operation_id::text, '-', ''), 1, 6));
  insert into public.invoices (
    organization_id, store_id, sale_id, customer_id, seller_id,
    invoice_number, subtotal, total_amount, email_status,
    customer_order_id, table_reference
  ) values (
    target_order.organization_id, target_order.store_id, result_sale.id,
    target_customer.id, auth.uid(), generated_number, invoice_total, invoice_total,
    case when target_customer.email is null then 'not_requested' else 'pending' end,
    target_order.id, target_order.table_reference
  ) returning * into result;

  for order_line in
    select order_item.*, menu_item.name
    from public.customer_order_items order_item
    join public.menu_items menu_item on menu_item.id = order_item.menu_item_id
    where order_item.customer_order_id = target_order.id
  loop
    insert into public.sale_items (
      sale_id, item_id, menu_item_id, quantity, unit_price, unit_cost_snapshot
    ) values (
      result_sale.id, null, order_line.menu_item_id,
      order_line.quantity, order_line.unit_price, 0
    );
    insert into public.invoice_items (
      invoice_id, item_id, menu_item_id, description, quantity, unit_price
    ) values (
      result.id, null, order_line.menu_item_id, order_line.name,
      order_line.quantity, order_line.unit_price
    );
  end loop;

  for ingredient_line in
    select recipe.item_id,
      sum(recipe.quantity_required * order_item.quantity) quantity
    from public.customer_order_items order_item
    join public.menu_item_ingredients recipe on recipe.menu_item_id = order_item.menu_item_id
    where order_item.customer_order_id = target_order.id
    group by recipe.item_id
  loop
    select quantity into current_quantity from public.stock_levels
    where item_id = ingredient_line.item_id for update;
    insert into public.inventory_movements (
      organization_id, store_id, item_id, sale_id, type,
      quantity_delta, quantity_before, quantity_after,
      reason, idempotency_key, created_by
    ) values (
      target_order.organization_id, target_order.store_id,
      ingredient_line.item_id, result_sale.id, 'vente',
      -ingredient_line.quantity, current_quantity,
      current_quantity - ingredient_line.quantity,
      'Commande ' || target_order.order_number,
      pg_catalog.gen_random_uuid(), auth.uid()
    );
    update public.stock_levels
    set quantity = current_quantity - ingredient_line.quantity, updated_at = now()
    where item_id = ingredient_line.item_id;
  end loop;

  update public.customer_orders set
    payment_status = 'paid', paid_by = auth.uid(), paid_at = now(),
    invoice_id = result.id
  where id = target_order.id;
  return result;
end;
$$;

create or replace function public.close_purchase_order_incomplete(
  target_purchase_order_id uuid,
  closing_comment text
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.purchase_orders;
  receiver_name text;
begin
  select * into result from public.purchase_orders
  where id = target_purchase_order_id for update;
  if auth.uid() is null or result.id is null
    or not public.can_access_store(result.organization_id, result.store_id) then
    raise exception 'Order not found';
  end if;
  if result.status not in ('ordered', 'pending') then
    raise exception 'Order cannot be closed';
  end if;
  if not exists (
    select 1 from public.purchase_order_items
    where purchase_order_id = result.id and received_quantity > 0
  ) then
    raise exception 'Receive at least one product before closing';
  end if;
  if char_length(trim(coalesce(closing_comment, ''))) < 3 then
    raise exception 'A closing comment is required';
  end if;
  update public.purchase_orders set
    status = 'received',
    closed_incomplete = true,
    closed_at = now(),
    closure_comment = trim(closing_comment)
  where id = result.id returning * into result;
  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'un vendeur')
  into receiver_name from public.profiles where id = auth.uid();
  insert into public.notifications (
    organization_id, store_id, recipient_id, type, title, message, purchase_order_id
  )
  select result.organization_id, result.store_id, membership.user_id,
    'delivery_received', 'Livraison clôturée incomplète',
    result.order_number || ' a été clôturée avec des manquants par ' || receiver_name,
    result.id
  from public.memberships membership
  where membership.organization_id = result.organization_id
    and membership.active = true
    and membership.role in ('owner', 'manager')
    and (membership.store_id is null or membership.store_id = result.store_id);
  return result;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_orders'
  ) then
    alter publication supabase_realtime add table public.customer_orders;
  end if;
end
$$;

revoke all on table public.menu_items from anon;
revoke all on table public.menu_item_ingredients from anon;
revoke all on table public.customer_orders from anon;
revoke all on table public.customer_order_items from anon;
grant select on table public.menu_items to authenticated;
grant select on table public.menu_item_ingredients to authenticated;
grant select on table public.customer_orders to authenticated;
grant select on table public.customer_order_items to authenticated;

revoke all on function public.set_store_business_type(uuid, text) from public;
revoke all on function public.save_menu_item(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.create_customer_order(uuid, text, jsonb, uuid) from public;
revoke all on function public.set_customer_order_status(uuid, public.preparation_status) from public;
revoke all on function public.pay_customer_order(uuid, uuid, jsonb, uuid) from public;
revoke all on function public.close_purchase_order_incomplete(uuid, text) from public;
grant execute on function public.set_store_business_type(uuid, text) to authenticated;
grant execute on function public.save_menu_item(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.create_customer_order(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.set_customer_order_status(uuid, public.preparation_status) to authenticated;
grant execute on function public.pay_customer_order(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.close_purchase_order_incomplete(uuid, text) to authenticated;
