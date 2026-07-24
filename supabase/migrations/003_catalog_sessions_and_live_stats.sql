-- Catalogue connecté, sessions vendeurs idempotentes et catégories du stock.

create or replace function public.start_work_session(
  target_store_id uuid,
  session_note text default null
)
returns public.work_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  result public.work_sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_store
  from public.stores
  where id = target_store_id
    and active = true;

  if target_store.id is null
    or not public.can_access_store(target_store.organization_id, target_store.id)
  then
    raise exception 'Store not found';
  end if;

  select *
  into result
  from public.work_sessions
  where organization_id = target_store.organization_id
    and user_id = auth.uid()
    and closed_at is null
  limit 1;

  if result.id is not null then
    return result;
  end if;

  insert into public.work_sessions (
    organization_id, store_id, user_id, opened_note
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    nullif(trim(session_note), '')
  )
  returning * into result;

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    'session_started',
    jsonb_build_object('session_id', result.id)
  );

  return result;
end;
$$;

create or replace function public.create_stock_item(
  target_store_id uuid,
  category_name text,
  product_name text,
  brand_name text,
  stock_kind public.stock_kind,
  unit_name text,
  initial_quantity numeric,
  alert_threshold numeric,
  item_unit_cost numeric,
  item_selling_price numeric,
  request_id uuid
)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store public.stores;
  target_category public.categories;
  result public.items;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_store
  from public.stores
  where id = target_store_id
    and active = true;

  if target_store.id is null
    or not public.can_manage_catalog(target_store.organization_id)
  then
    raise exception 'Permission denied';
  end if;

  if initial_quantity < 0
    or alert_threshold < 0
    or item_unit_cost < 0
    or item_selling_price < 0
  then
    raise exception 'Numeric values cannot be negative';
  end if;

  if nullif(trim(product_name), '') is null
    or nullif(trim(brand_name), '') is null
    or nullif(trim(unit_name), '') is null
    or nullif(trim(category_name), '') is null
  then
    raise exception 'Required fields are missing';
  end if;

  select *
  into result
  from public.items
  where organization_id = target_store.organization_id
    and store_id = target_store.id
    and lower(name) = lower(trim(product_name))
    and lower(brand) = lower(trim(brand_name))
  limit 1;

  if result.id is not null then
    raise exception 'Item already exists';
  end if;

  select *
  into target_category
  from public.categories
  where organization_id = target_store.organization_id
    and lower(name) = lower(trim(category_name))
    and active = true
  limit 1;

  if target_category.id is null then
    insert into public.categories (organization_id, name)
    values (target_store.organization_id, trim(category_name))
    returning * into target_category;
  end if;

  insert into public.items (
    organization_id,
    store_id,
    category_id,
    name,
    brand,
    kind,
    unit,
    threshold,
    unit_cost,
    selling_price
  )
  values (
    target_store.organization_id,
    target_store.id,
    target_category.id,
    trim(product_name),
    trim(brand_name),
    stock_kind,
    trim(unit_name),
    alert_threshold,
    item_unit_cost,
    item_selling_price
  )
  returning * into result;

  if initial_quantity > 0 then
    update public.stock_levels
    set quantity = initial_quantity, updated_at = now()
    where item_id = result.id;

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
      target_store.organization_id,
      target_store.id,
      result.id,
      'entree',
      initial_quantity,
      0,
      initial_quantity,
      'Stock initial',
      request_id,
      auth.uid()
    );
  end if;

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    'stock_update',
    jsonb_build_object(
      'item_id', result.id,
      'action', 'item_created',
      'initial_quantity', initial_quantity
    )
  );

  return result;
end;
$$;

revoke all on function public.create_stock_item(
  uuid, text, text, text, public.stock_kind, text,
  numeric, numeric, numeric, numeric, uuid
) from public;

grant execute on function public.create_stock_item(
  uuid, text, text, text, public.stock_kind, text,
  numeric, numeric, numeric, numeric, uuid
) to authenticated;

create or replace view public.stock_overview
with (security_invoker = true)
as
select
  i.organization_id,
  i.store_id,
  i.id as item_id,
  i.name,
  i.brand,
  i.kind,
  i.unit,
  i.threshold,
  i.unit_cost,
  i.selling_price,
  coalesce(sl.quantity, 0) as quantity,
  coalesce(sl.quantity, 0) * i.unit_cost as stock_cost_value,
  coalesce(sl.quantity, 0) * i.selling_price as potential_sales_value,
  case
    when coalesce(sl.quantity, 0) <= 0 then 'rupture'
    when coalesce(sl.quantity, 0) <= i.threshold then 'surveillance'
    else 'ok'
  end as stock_status,
  i.category_id,
  coalesce(c.name, 'Sans catégorie') as category_name
from public.items i
left join public.stock_levels sl on sl.item_id = i.id
left join public.categories c on c.id = i.category_id
where i.active = true;

grant select on public.stock_overview to authenticated;
