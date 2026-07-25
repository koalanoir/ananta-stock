-- Sprint 1 — Rentabilité
-- Fige le coût d'achat au moment de la vente et sécurise la création de boutique.

alter table public.stores
  alter column login_code
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

alter table public.sale_items
  add column if not exists unit_cost_snapshot numeric(14,2);

update public.sale_items si
set unit_cost_snapshot = i.unit_cost
from public.items i
where i.id = si.item_id
  and si.unit_cost_snapshot is null;

alter table public.sale_items
  alter column unit_cost_snapshot set default 0,
  alter column unit_cost_snapshot set not null;

alter table public.sale_items
  drop column if exists line_cost;

alter table public.sale_items
  add column line_cost numeric(14,2)
  generated always as (quantity * unit_cost_snapshot) stored;

alter table public.sale_items
  drop column if exists gross_margin;

alter table public.sale_items
  add column gross_margin numeric(14,2)
  generated always as (
    (quantity * unit_price) - (quantity * unit_cost_snapshot)
  ) stored;

create or replace function public.record_sale(
  target_item_id uuid,
  quantity_sold numeric,
  request_id uuid
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.items;
  current_quantity numeric(14,3);
  result public.sales;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if quantity_sold <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select *
  into target_item
  from public.items
  where id = target_item_id
    and active = true
    and kind = 'commercialise';

  if target_item.id is null
    or not public.can_access_store(
      target_item.organization_id,
      target_item.store_id
    )
  then
    raise exception 'Item not found';
  end if;

  select *
  into result
  from public.sales
  where organization_id = target_item.organization_id
    and idempotency_key = request_id;

  if result.id is not null then
    return result;
  end if;

  select quantity
  into current_quantity
  from public.stock_levels
  where item_id = target_item.id
  for update;

  if current_quantity is null then
    raise exception 'Stock level not found';
  end if;

  if current_quantity < quantity_sold then
    raise exception 'Insufficient stock';
  end if;

  insert into public.sales (
    organization_id,
    store_id,
    seller_id,
    total_amount,
    idempotency_key
  )
  values (
    target_item.organization_id,
    target_item.store_id,
    auth.uid(),
    quantity_sold * target_item.selling_price,
    request_id
  )
  returning * into result;

  insert into public.sale_items (
    sale_id,
    item_id,
    quantity,
    unit_price,
    unit_cost_snapshot
  )
  values (
    result.id,
    target_item.id,
    quantity_sold,
    target_item.selling_price,
    target_item.unit_cost
  );

  insert into public.inventory_movements (
    organization_id,
    store_id,
    item_id,
    sale_id,
    type,
    quantity_delta,
    quantity_before,
    quantity_after,
    reason,
    idempotency_key,
    created_by
  )
  values (
    target_item.organization_id,
    target_item.store_id,
    target_item.id,
    result.id,
    'vente',
    -quantity_sold,
    current_quantity,
    current_quantity - quantity_sold,
    'Vente',
    request_id,
    auth.uid()
  );

  update public.stock_levels
  set
    quantity = current_quantity - quantity_sold,
    updated_at = now()
  where item_id = target_item.id;

  insert into public.user_activity_logs (
    organization_id,
    store_id,
    user_id,
    type,
    metadata
  )
  values (
    target_item.organization_id,
    target_item.store_id,
    auth.uid(),
    'sale',
    jsonb_build_object(
      'sale_id', result.id,
      'item_id', target_item.id,
      'quantity', quantity_sold,
      'amount', result.total_amount,
      'cost', quantity_sold * target_item.unit_cost,
      'gross_margin',
        quantity_sold * (target_item.selling_price - target_item.unit_cost)
    )
  );

  return result;
end;
$$;

revoke all on function public.record_sale(uuid, numeric, uuid)
from public, anon;

grant execute on function public.record_sale(uuid, numeric, uuid)
to authenticated;

create index if not exists sale_items_item_created_idx
  on public.sale_items (item_id, created_at desc);
