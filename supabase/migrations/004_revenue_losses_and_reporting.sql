-- Chiffre d'affaires, pertes vendeurs et reporting MVP.

create or replace function public.record_stock_loss(
  target_item_id uuid,
  quantity_lost numeric,
  loss_reason text,
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

  if quantity_lost <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  if char_length(trim(loss_reason)) < 3 then
    raise exception 'A loss reason is required';
  end if;

  select *
  into target_item
  from public.items
  where id = target_item_id
    and active = true;

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

  if current_quantity < quantity_lost then
    raise exception 'Insufficient stock';
  end if;

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
    target_item.organization_id,
    target_item.store_id,
    target_item.id,
    'perte',
    -quantity_lost,
    current_quantity,
    current_quantity - quantity_lost,
    trim(loss_reason),
    request_id,
    auth.uid()
  )
  returning * into result;

  update public.stock_levels
  set
    quantity = current_quantity - quantity_lost,
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
    'stock_update',
    jsonb_build_object(
      'movement_id', result.id,
      'item_id', target_item.id,
      'movement_type', 'perte',
      'quantity_delta', -quantity_lost,
      'reason', trim(loss_reason)
    )
  );

  return result;
end;
$$;

revoke all on function public.record_stock_loss(uuid, numeric, text, uuid)
from public;

grant execute on function public.record_stock_loss(uuid, numeric, text, uuid)
to authenticated;

