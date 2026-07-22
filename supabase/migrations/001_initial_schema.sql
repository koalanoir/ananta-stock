-- Ananta Stock MVP — PostgreSQL schema for Supabase
create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner', 'manager');
create type public.stock_kind as enum ('commercialise', 'outil');
create type public.movement_type as enum ('entree', 'sortie', 'perte', 'ajustement');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.membership_role not null default 'manager',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  currency char(3) not null default 'XAF',
  timezone text not null default 'Africa/Brazzaville',
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  sku text,
  kind public.stock_kind not null,
  unit text not null check (char_length(unit) between 1 and 40),
  threshold numeric(14,3) not null default 0 check (threshold >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (store_id, sku)
);

create table public.stock_levels (
  item_id uuid primary key references public.items(id) on delete cascade,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  type public.movement_type not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  quantity_before numeric(14,3) not null check (quantity_before >= 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  reason text,
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index memberships_user_id_idx on public.memberships(user_id);
create index stores_organization_id_idx on public.stores(organization_id);
create index categories_organization_id_idx on public.categories(organization_id);
create index items_organization_store_idx on public.items(organization_id, store_id);
create index movements_store_created_idx on public.inventory_movements(store_id, created_at desc);
create index movements_item_created_idx on public.inventory_movements(item_id, created_at desc);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

create or replace function public.create_organization(organization_name text, store_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.organizations(name) values (organization_name) returning id into new_organization_id;
  insert into public.memberships(organization_id, user_id, role) values (new_organization_id, auth.uid(), 'owner');
  insert into public.stores(organization_id, name) values (new_organization_id, store_name);
  return new_organization_id;
end;
$$;

create or replace function public.record_inventory_movement(
  target_item_id uuid,
  movement public.movement_type,
  quantity_value numeric,
  movement_reason text,
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
  signed_delta numeric(14,3);
  result public.inventory_movements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if movement = 'ajustement' and quantity_value < 0 then raise exception 'Stock cannot be negative'; end if;
  if movement <> 'ajustement' and quantity_value <= 0 then raise exception 'Quantity must be positive'; end if;

  select * into target_item from public.items where id = target_item_id and active = true;
  if target_item.id is null or not public.is_organization_member(target_item.organization_id) then
    raise exception 'Item not found';
  end if;

  select * into result
  from public.inventory_movements
  where organization_id = target_item.organization_id and idempotency_key = request_id;
  if result.id is not null then return result; end if;

  select quantity into current_quantity from public.stock_levels where item_id = target_item_id for update;
  if current_quantity is null then
    insert into public.stock_levels(item_id, quantity) values (target_item_id, 0)
      on conflict (item_id) do nothing;
    select quantity into current_quantity from public.stock_levels where item_id = target_item_id for update;
  end if;

  signed_delta := case
    when movement = 'entree' then quantity_value
    when movement = 'ajustement' then quantity_value - current_quantity
    else -quantity_value
  end;
  if signed_delta = 0 then raise exception 'Movement does not change stock'; end if;
  if current_quantity + signed_delta < 0 then raise exception 'Insufficient stock'; end if;

  insert into public.inventory_movements(
    organization_id, store_id, item_id, type, quantity_delta,
    quantity_before, quantity_after, reason, idempotency_key, created_by
  ) values (
    target_item.organization_id, target_item.store_id, target_item.id, movement, signed_delta,
    current_quantity, current_quantity + signed_delta, nullif(trim(movement_reason), ''), request_id, auth.uid()
  ) returning * into result;

  update public.stock_levels set quantity = result.quantity_after, updated_at = now() where item_id = target_item_id;
  return result;
end;
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.stock_levels enable row level security;
alter table public.inventory_movements enable row level security;

create policy "members read organizations" on public.organizations for select using (public.is_organization_member(id));
create policy "owners update organizations" on public.organizations for update using (public.is_organization_owner(id));
create policy "users read own profile" on public.profiles for select using (id = (select auth.uid()));
create policy "users update own profile" on public.profiles for update using (id = (select auth.uid()));
create policy "members read memberships" on public.memberships for select using (public.is_organization_member(organization_id));
create policy "owners manage memberships" on public.memberships for all using (public.is_organization_owner(organization_id)) with check (public.is_organization_owner(organization_id));
create policy "members read stores" on public.stores for select using (public.is_organization_member(organization_id));
create policy "owners manage stores" on public.stores for all using (public.is_organization_owner(organization_id)) with check (public.is_organization_owner(organization_id));
create policy "members read categories" on public.categories for select using (public.is_organization_member(organization_id));
create policy "owners manage categories" on public.categories for all using (public.is_organization_owner(organization_id)) with check (public.is_organization_owner(organization_id));
create policy "members read items" on public.items for select using (public.is_organization_member(organization_id));
create policy "owners manage items" on public.items for all using (public.is_organization_owner(organization_id)) with check (public.is_organization_owner(organization_id));
create policy "members read stock levels" on public.stock_levels for select using (exists (select 1 from public.items where items.id = item_id and public.is_organization_member(items.organization_id)));
create policy "members read movements" on public.inventory_movements for select using (public.is_organization_member(organization_id));

grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.record_inventory_movement(uuid, public.movement_type, numeric, text, uuid) to authenticated;
revoke insert, update, delete on public.stock_levels from anon, authenticated;
revoke insert, update, delete on public.inventory_movements from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
