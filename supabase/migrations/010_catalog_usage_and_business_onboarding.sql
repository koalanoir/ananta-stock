-- Usages de stock distincts et choix du type de commerce à l'inscription.
-- À exécuter après 009_restaurant_pos_and_partial_receipts.sql.

alter type public.stock_kind add value if not exists 'ingredient';

update public.items
set selling_price = 0
where kind <> 'commercialise';

alter table public.items
  drop constraint if exists items_non_sellable_zero_price;

alter table public.items
  add constraint items_non_sellable_zero_price
  check (kind = 'commercialise' or selling_price = 0);

create or replace function public.create_organization(
  organization_name text,
  store_name text,
  selected_business_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  new_store_id uuid;
  generated_slug text;
  normalized_business_type text := lower(trim(coalesce(selected_business_type, 'retail')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(organization_name)) < 2
    or char_length(trim(store_name)) < 2
  then
    raise exception 'Organization and store names are required';
  end if;

  if normalized_business_type not in ('retail', 'restaurant') then
    raise exception 'Invalid business type';
  end if;

  generated_slug :=
    trim(both '-' from regexp_replace(lower(trim(organization_name)), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(pg_catalog.gen_random_uuid()::text, 1, 8);

  insert into public.organizations (name, slug)
  values (trim(organization_name), generated_slug)
  returning id into new_organization_id;

  insert into public.stores (organization_id, name, business_type)
  values (new_organization_id, trim(store_name), normalized_business_type)
  returning id into new_store_id;

  insert into public.memberships (
    organization_id, user_id, store_id, role, created_by
  )
  values (
    new_organization_id, auth.uid(), new_store_id, 'owner', auth.uid()
  );

  return new_organization_id;
end;
$$;

-- Compatibilité avec les anciens clients : ils créent un commerce classique.
create or replace function public.create_organization(
  organization_name text,
  store_name text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_organization(organization_name, store_name, 'retail');
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
  normalized_brand text := coalesce(nullif(trim(brand_name), ''), '');
  normalized_category text := trim(category_name);
  normalized_unit text := trim(unit_name);
  normalized_selling_price numeric := case
    when stock_kind = 'commercialise' then item_selling_price
    else 0
  end;
  allowed_categories constant text[] := array[
    'Alimentation', 'Boissons', 'Épicerie', 'Produits frais',
    'Hygiène', 'Entretien', 'Emballage', 'Fournitures',
    'Équipement', 'Textile', 'Beauté', 'Autre'
  ];
  allowed_units constant text[] := array[
    'unité', 'pièce', 'paquet', 'sachet', 'sac', 'bouteille',
    'bidon', 'boîte', 'carton', 'rouleau', 'kilogramme',
    'gramme', 'litre', 'millilitre', 'mètre'
  ];
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

  if initial_quantity < 0 or alert_threshold < 0 or item_unit_cost < 0
    or normalized_selling_price < 0
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

  select * into result
  from public.items
  where organization_id = target_store.organization_id
    and store_id = target_store.id
    and lower(name) = lower(trim(product_name))
    and lower(brand) = lower(normalized_brand)
  limit 1;

  if result.id is not null then
    raise exception 'Item already exists';
  end if;

  select * into target_category
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
    organization_id, store_id, category_id, name, brand, kind, unit,
    threshold, unit_cost, selling_price
  )
  values (
    target_store.organization_id, target_store.id, target_category.id,
    trim(product_name), normalized_brand, stock_kind, normalized_unit,
    alert_threshold, item_unit_cost, normalized_selling_price
  )
  returning * into result;

  if initial_quantity > 0 then
    update public.stock_levels
    set quantity = initial_quantity, updated_at = now()
    where item_id = result.id;

    insert into public.inventory_movements (
      organization_id, store_id, item_id, type, quantity_delta,
      quantity_before, quantity_after, reason, idempotency_key, created_by
    )
    values (
      target_store.organization_id, target_store.id, result.id, 'entree',
      initial_quantity, 0, initial_quantity, 'Stock initial',
      request_id, auth.uid()
    );
  end if;

  insert into public.user_activity_logs (
    organization_id, store_id, user_id, type, metadata
  )
  values (
    target_store.organization_id, target_store.id, auth.uid(), 'stock_update',
    jsonb_build_object(
      'item_id', result.id,
      'action', 'item_created',
      'stock_kind', stock_kind,
      'initial_quantity', initial_quantity
    )
  );

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
  select * into target_store
  from public.stores
  where id = target_store_id and active = true;

  if auth.uid() is null or target_store.id is null
    or target_store.business_type <> 'restaurant'
    or not public.can_manage_catalog(target_store.organization_id)
  then
    raise exception 'Permission denied';
  end if;

  if char_length(trim(coalesce(menu_data ->> 'name', ''))) < 2 then
    raise exception 'Name is required';
  end if;

  if coalesce((menu_data ->> 'selling_price')::numeric, -1) < 0 then
    raise exception 'Invalid price';
  end if;

  if jsonb_typeof(ingredient_lines) <> 'array'
    or jsonb_array_length(ingredient_lines) = 0
  then
    raise exception 'At least one ingredient is required';
  end if;

  if target_menu_item_id is null then
    insert into public.menu_items (
      organization_id, store_id, name, description, type,
      selling_price, created_by
    )
    values (
      target_store.organization_id, target_store.id,
      trim(menu_data ->> 'name'),
      nullif(trim(menu_data ->> 'description'), ''),
      (menu_data ->> 'type')::public.menu_item_type,
      (menu_data ->> 'selling_price')::numeric,
      auth.uid()
    )
    returning * into result;
  else
    update public.menu_items
    set
      name = trim(menu_data ->> 'name'),
      description = nullif(trim(menu_data ->> 'description'), ''),
      type = (menu_data ->> 'type')::public.menu_item_type,
      selling_price = (menu_data ->> 'selling_price')::numeric,
      active = coalesce((menu_data ->> 'active')::boolean, active)
    where id = target_menu_item_id and store_id = target_store.id
    returning * into result;

    if result.id is null then
      raise exception 'Menu item not found';
    end if;

    delete from public.menu_item_ingredients where menu_item_id = result.id;
  end if;

  for line in select * from jsonb_array_elements(ingredient_lines)
  loop
    select * into target_ingredient
    from public.items
    where id = (line ->> 'item_id')::uuid
      and store_id = target_store.id
      and organization_id = target_store.organization_id
      and kind = 'ingredient'
      and active = true;

    if target_ingredient.id is null then
      raise exception 'Ingredient not found';
    end if;

    insert into public.menu_item_ingredients (
      menu_item_id, item_id, quantity_required
    )
    values (
      result.id,
      target_ingredient.id,
      (line ->> 'quantity')::numeric
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
