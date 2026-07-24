alter table public.stores
  add column if not exists login_code text;

alter table public.memberships
  add column if not exists username text,
  add column if not exists login_enabled boolean not null default true;

create unique index if not exists stores_login_code_unique
  on public.stores (upper(login_code))
  where login_code is not null;

create unique index if not exists memberships_store_username_unique
  on public.memberships (store_id, lower(username))
  where username is not null and active = true;

create or replace function public.record_stock_count(
  target_item_id uuid,
  counted_quantity numeric,
  count_note text,
  request_id uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.items;
  current_quantity numeric(14,3);
  result public.inventory_movements;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if counted_quantity < 0 then
    raise exception 'Stock cannot be negative';
  end if;

  select *
  into target_item
  from public.items
  where id = target_item_id
    and active = true;

  if target_item.id is null
    or not public.can_access_store(target_item.organization_id, target_item.store_id)
  then
    raise exception 'Item not found';
  end if;

  select *
  into result
  from public.inventory_movements
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

  if current_quantity = counted_quantity then
    raise exception 'Movement does not change stock';
  end if;

  insert into public.inventory_movements (
    organization_id, store_id, item_id, type, quantity_delta,
    quantity_before, quantity_after, reason, idempotency_key, created_by
  )
  values (
    target_item.organization_id, target_item.store_id, target_item.id,
    'ajustement', counted_quantity - current_quantity, current_quantity,
    counted_quantity, nullif(trim(count_note), ''), request_id, auth.uid()
  )
  returning * into result;

  update public.stock_levels
  set quantity = counted_quantity, updated_at = now()
  where item_id = target_item.id;

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_item.organization_id, target_item.store_id, auth.uid(),
    'stock_update',
    jsonb_build_object(
      'movement_id', result.id,
      'item_id', target_item.id,
      'movement_type', 'ajustement',
      'quantity_delta', result.quantity_delta
    )
  );

  return result;
end;
$$;

revoke all on function public.record_stock_count(uuid, numeric, text, uuid) from public;
grant execute on function public.record_stock_count(uuid, numeric, text, uuid) to authenticated;
