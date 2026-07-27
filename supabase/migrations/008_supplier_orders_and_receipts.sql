-- Sprint 4 & 5 : commandes fournisseurs et réception des livraisons.
-- À exécuter après 007_catalog_references_and_invoice_fix.sql.

create type public.purchase_order_status as enum (
  'draft',
  'ordered',
  'pending',
  'received',
  'cancelled'
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index suppliers_store_name_unique_idx
  on public.suppliers (store_id, lower(name));

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  order_number text not null,
  status public.purchase_order_status not null default 'draft',
  notes text,
  expected_delivery_date date,
  ordered_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete restrict,
  unique (store_id, order_number),
  unique (organization_id, request_id)
);

create index purchase_orders_store_status_idx
  on public.purchase_orders (store_id, status, created_at desc);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  ordered_quantity numeric(14,3) not null check (ordered_quantity > 0),
  received_quantity numeric(14,3) not null default 0
    check (received_quantity >= 0 and received_quantity <= ordered_quantity),
  unit_cost_snapshot numeric(14,2) not null default 0 check (unit_cost_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, item_id)
);

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  receipt_number text not null,
  general_comment text,
  received_by uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete restrict,
  unique (store_id, receipt_number),
  unique (organization_id, request_id)
);

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  received_quantity numeric(14,3) not null check (received_quantity > 0),
  comment text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('delivery_received')),
  title text not null,
  message text not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute procedure public.set_updated_at();

create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute procedure public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.notifications enable row level security;

create policy suppliers_select_store
on public.suppliers for select to authenticated
using (public.can_access_store(organization_id, store_id));

create policy purchase_orders_select_store
on public.purchase_orders for select to authenticated
using (
  public.can_access_store(organization_id, store_id)
  and (
    public.can_manage_catalog(organization_id)
    or status <> 'draft'
  )
);

create policy purchase_order_items_select_store
on public.purchase_order_items for select to authenticated
using (
  exists (
    select 1
    from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_items.purchase_order_id
      and public.can_access_store(
        purchase_order.organization_id,
        purchase_order.store_id
      )
      and (
        public.can_manage_catalog(purchase_order.organization_id)
        or purchase_order.status <> 'draft'
      )
  )
);

create policy goods_receipts_select_store
on public.goods_receipts for select to authenticated
using (public.can_access_store(organization_id, store_id));

create policy goods_receipt_items_select_store
on public.goods_receipt_items for select to authenticated
using (
  exists (
    select 1
    from public.goods_receipts receipt
    where receipt.id = goods_receipt_items.goods_receipt_id
      and public.can_access_store(receipt.organization_id, receipt.store_id)
  )
);

create policy notifications_select_recipient
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));

create or replace function public.create_purchase_order(
  target_store_id uuid,
  supplier_data jsonb,
  order_lines jsonb,
  order_notes text,
  expected_delivery date,
  operation_id uuid
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  target_supplier public.suppliers;
  target_item public.items;
  result public.purchase_orders;
  line jsonb;
  line_quantity numeric(14,3);
  supplier_name text := trim(coalesce(supplier_data ->> 'name', ''));
  generated_number text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_store
  from public.stores
  where id = target_store_id and active = true;

  if target_store.id is null
    or not public.can_manage_catalog(target_store.organization_id)
  then
    raise exception 'Permission denied';
  end if;

  select * into result
  from public.purchase_orders
  where organization_id = target_store.organization_id
    and request_id = operation_id;

  if result.id is not null then
    return result;
  end if;

  if char_length(supplier_name) < 2 then
    raise exception 'Supplier name is required';
  end if;

  if jsonb_typeof(order_lines) <> 'array'
    or jsonb_array_length(order_lines) = 0
  then
    raise exception 'Order lines are required';
  end if;

  select * into target_supplier
  from public.suppliers
  where store_id = target_store.id
    and lower(name) = lower(supplier_name)
    and active = true
  limit 1;

  if target_supplier.id is null then
    insert into public.suppliers (
      organization_id, store_id, name, email, phone
    )
    values (
      target_store.organization_id,
      target_store.id,
      supplier_name,
      nullif(lower(trim(supplier_data ->> 'email')), ''),
      nullif(trim(supplier_data ->> 'phone'), '')
    )
    returning * into target_supplier;
  end if;

  generated_number :=
    'CMD-' || to_char(now() at time zone target_store.timezone, 'YYYYMMDD')
    || '-' || upper(substr(replace(operation_id::text, '-', ''), 1, 6));

  insert into public.purchase_orders (
    organization_id,
    store_id,
    supplier_id,
    order_number,
    notes,
    expected_delivery_date,
    created_by,
    request_id
  )
  values (
    target_store.organization_id,
    target_store.id,
    target_supplier.id,
    generated_number,
    nullif(trim(order_notes), ''),
    expected_delivery,
    auth.uid(),
    operation_id
  )
  returning * into result;

  for line in select * from jsonb_array_elements(order_lines)
  loop
    line_quantity := (line ->> 'quantity')::numeric;

    if line_quantity <= 0 then
      raise exception 'Quantity must be positive';
    end if;

    select * into target_item
    from public.items
    where id = (line ->> 'item_id')::uuid
      and organization_id = target_store.organization_id
      and store_id = target_store.id
      and active = true;

    if target_item.id is null then
      raise exception 'Item not found';
    end if;

    insert into public.purchase_order_items (
      purchase_order_id,
      item_id,
      ordered_quantity,
      unit_cost_snapshot
    )
    values (
      result.id,
      target_item.id,
      line_quantity,
      target_item.unit_cost
    );
  end loop;

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    'stock_update',
    jsonb_build_object(
      'action', 'purchase_order_created',
      'purchase_order_id', result.id,
      'order_number', generated_number
    )
  );

  return result;
end;
$$;

create or replace function public.set_purchase_order_status(
  target_purchase_order_id uuid,
  new_status public.purchase_order_status
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.purchase_orders;
begin
  select * into result
  from public.purchase_orders
  where id = target_purchase_order_id;

  if auth.uid() is null
    or result.id is null
    or not public.can_manage_catalog(result.organization_id)
  then
    raise exception 'Permission denied';
  end if;

  if (result.status = 'draft' and new_status not in ('ordered', 'pending', 'cancelled'))
    or (result.status = 'ordered' and new_status not in ('pending', 'cancelled'))
    or (result.status = 'pending' and new_status not in ('cancelled'))
    or result.status in ('received', 'cancelled')
  then
    raise exception 'Invalid status transition';
  end if;

  update public.purchase_orders
  set
    status = new_status,
    ordered_at = case
      when new_status in ('ordered', 'pending') and ordered_at is null then now()
      else ordered_at
    end
  where id = result.id
  returning * into result;

  return result;
end;
$$;

create or replace function public.receive_purchase_order(
  target_purchase_order_id uuid,
  received_lines jsonb,
  receipt_comment text,
  operation_id uuid
)
returns public.goods_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.purchase_orders;
  target_line public.purchase_order_items;
  current_quantity numeric(14,3);
  receipt_quantity numeric(14,3);
  result public.goods_receipts;
  line jsonb;
  processed_lines integer := 0;
  generated_number text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into result
  from public.goods_receipts
  where organization_id = (
    select organization_id
    from public.purchase_orders
    where id = target_purchase_order_id
  )
    and request_id = operation_id;

  if result.id is not null then
    return result;
  end if;

  select * into target_order
  from public.purchase_orders
  where id = target_purchase_order_id
  for update;

  if target_order.id is null
    or not public.can_access_store(
      target_order.organization_id,
      target_order.store_id
    )
  then
    raise exception 'Order not found';
  end if;

  if target_order.status not in ('ordered', 'pending') then
    raise exception 'Order cannot be received';
  end if;

  if jsonb_typeof(received_lines) <> 'array'
    or jsonb_array_length(received_lines) = 0
  then
    raise exception 'Receipt lines are required';
  end if;

  generated_number :=
    'REC-' || to_char(now(), 'YYYYMMDD')
    || '-' || upper(substr(replace(operation_id::text, '-', ''), 1, 6));

  insert into public.goods_receipts (
    organization_id,
    store_id,
    purchase_order_id,
    receipt_number,
    general_comment,
    received_by,
    request_id
  )
  values (
    target_order.organization_id,
    target_order.store_id,
    target_order.id,
    generated_number,
    nullif(trim(receipt_comment), ''),
    auth.uid(),
    operation_id
  )
  returning * into result;

  for line in select * from jsonb_array_elements(received_lines)
  loop
    receipt_quantity := coalesce((line ->> 'quantity')::numeric, 0);

    if receipt_quantity <= 0 then
      continue;
    end if;

    select * into target_line
    from public.purchase_order_items
    where id = (line ->> 'purchase_order_item_id')::uuid
      and purchase_order_id = target_order.id
    for update;

    if target_line.id is null then
      raise exception 'Order line not found';
    end if;

    if receipt_quantity >
      target_line.ordered_quantity - target_line.received_quantity
    then
      raise exception 'Received quantity exceeds remaining quantity';
    end if;

    select quantity into current_quantity
    from public.stock_levels
    where item_id = target_line.item_id
    for update;

    if current_quantity is null then
      raise exception 'Stock level not found';
    end if;

    insert into public.goods_receipt_items (
      goods_receipt_id,
      purchase_order_item_id,
      item_id,
      received_quantity,
      comment
    )
    values (
      result.id,
      target_line.id,
      target_line.item_id,
      receipt_quantity,
      nullif(trim(line ->> 'comment'), '')
    );

    update public.purchase_order_items
    set received_quantity = received_quantity + receipt_quantity
    where id = target_line.id;

    insert into public.inventory_movements (
      organization_id,
      store_id,
      item_id,
      type,
      quantity_delta,
      quantity_before,
      quantity_after,
      reason,
      idempotency_key,
      created_by
    )
    values (
      target_order.organization_id,
      target_order.store_id,
      target_line.item_id,
      'entree',
      receipt_quantity,
      current_quantity,
      current_quantity + receipt_quantity,
      'Réception ' || target_order.order_number,
      coalesce(
        nullif(line ->> 'movement_id', '')::uuid,
        pg_catalog.gen_random_uuid()
      ),
      auth.uid()
    );

    update public.stock_levels
    set quantity = current_quantity + receipt_quantity, updated_at = now()
    where item_id = target_line.item_id;

    processed_lines := processed_lines + 1;
  end loop;

  if processed_lines = 0 then
    raise exception 'At least one received quantity is required';
  end if;

  update public.purchase_orders
  set status = case
    when exists (
      select 1
      from public.purchase_order_items
      where purchase_order_id = target_order.id
        and received_quantity < ordered_quantity
    ) then 'pending'::public.purchase_order_status
    else 'received'::public.purchase_order_status
  end
  where id = target_order.id;

  insert into public.notifications (
    organization_id,
    store_id,
    recipient_id,
    type,
    title,
    message,
    purchase_order_id
  )
  select
    target_order.organization_id,
    target_order.store_id,
    membership.user_id,
    'delivery_received',
    'Livraison réceptionnée',
    target_order.order_number || ' a été réceptionnée par '
      || coalesce(
        nullif(trim(profile.full_name), ''),
        nullif(trim(profile.email), ''),
        'un vendeur'
      ),
    target_order.id
  from public.memberships membership
  cross join public.profiles profile
  where membership.organization_id = target_order.organization_id
    and profile.id = auth.uid()
    and membership.active = true
    and membership.role in ('owner', 'manager')
    and (
      membership.store_id is null
      or membership.store_id = target_order.store_id
    );

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_order.organization_id,
    target_order.store_id,
    auth.uid(),
    'stock_update',
    jsonb_build_object(
      'action', 'purchase_order_received',
      'purchase_order_id', target_order.id,
      'goods_receipt_id', result.id,
      'receipt_number', generated_number
    )
  );

  return result;
end;
$$;

create or replace function public.mark_notification_read(
  target_notification_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where id = target_notification_id
    and recipient_id = auth.uid();
$$;

revoke all on table public.suppliers from anon;
revoke all on table public.purchase_orders from anon;
revoke all on table public.purchase_order_items from anon;
revoke all on table public.goods_receipts from anon;
revoke all on table public.goods_receipt_items from anon;
revoke all on table public.notifications from anon;

grant select on table public.suppliers to authenticated;
grant select on table public.purchase_orders to authenticated;
grant select on table public.purchase_order_items to authenticated;
grant select on table public.goods_receipts to authenticated;
grant select on table public.goods_receipt_items to authenticated;
grant select on table public.notifications to authenticated;

revoke all on function public.create_purchase_order(
  uuid, jsonb, jsonb, text, date, uuid
) from public;
grant execute on function public.create_purchase_order(
  uuid, jsonb, jsonb, text, date, uuid
) to authenticated;

revoke all on function public.set_purchase_order_status(
  uuid, public.purchase_order_status
) from public;
grant execute on function public.set_purchase_order_status(
  uuid, public.purchase_order_status
) to authenticated;

revoke all on function public.receive_purchase_order(
  uuid, jsonb, text, uuid
) from public;
grant execute on function public.receive_purchase_order(
  uuid, jsonb, text, uuid
) to authenticated;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
