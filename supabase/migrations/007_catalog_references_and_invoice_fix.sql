-- Correctifs facturation et référentiels contrôlés du catalogue.
-- À exécuter après 006_invoicing_crm.sql.

-- Compatibilité avec la fonction de facturation déjà déployée par la migration
-- 006 : gen_random_uuid est une fonction native de PostgreSQL, pas une
-- fonction du schéma public sur Supabase.
create or replace function public.gen_random_uuid()
returns uuid
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.gen_random_uuid();
$$;

revoke all on function public.gen_random_uuid() from public;

-- La marque est facultative. Une chaîne vide reste préférable à NULL afin de
-- conserver les lectures et recherches existantes sans cas particulier.
alter table public.items
  alter column brand set default '';

alter table public.items
  drop constraint if exists items_brand_check;

alter table public.items
  add constraint items_brand_check
  check (char_length(trim(brand)) <= 100);

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
  normalized_brand text := coalesce(nullif(trim(brand_name), ''), '');
  normalized_category text := trim(category_name);
  normalized_unit text := trim(unit_name);
  allowed_categories constant text[] := array[
    'Alimentation',
    'Boissons',
    'Épicerie',
    'Produits frais',
    'Hygiène',
    'Entretien',
    'Emballage',
    'Fournitures',
    'Équipement',
    'Textile',
    'Beauté',
    'Autre'
  ];
  allowed_units constant text[] := array[
    'unité',
    'pièce',
    'paquet',
    'sachet',
    'sac',
    'bouteille',
    'bidon',
    'boîte',
    'carton',
    'rouleau',
    'kilogramme',
    'gramme',
    'litre',
    'millilitre',
    'mètre'
  ];
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
    or nullif(normalized_unit, '') is null
    or nullif(normalized_category, '') is null
  then
    raise exception 'Required fields are missing';
  end if;

  if normalized_category <> all(allowed_categories) then
    raise exception 'Invalid category';
  end if;

  if normalized_unit <> all(allowed_units) then
    raise exception 'Invalid unit';
  end if;

  select *
  into result
  from public.items
  where organization_id = target_store.organization_id
    and store_id = target_store.id
    and lower(name) = lower(trim(product_name))
    and lower(brand) = lower(normalized_brand)
  limit 1;

  if result.id is not null then
    raise exception 'Item already exists';
  end if;

  select *
  into target_category
  from public.categories
  where organization_id = target_store.organization_id
    and lower(name) = lower(normalized_category)
    and active = true
  limit 1;

  if target_category.id is null then
    insert into public.categories (organization_id, name)
    values (target_store.organization_id, normalized_category)
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
    normalized_brand,
    stock_kind,
    normalized_unit,
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
  uuid,
  text,
  text,
  text,
  public.stock_kind,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  uuid
) from public;

grant execute on function public.create_stock_item(
  uuid,
  text,
  text,
  text,
  public.stock_kind,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  uuid
) to authenticated;
