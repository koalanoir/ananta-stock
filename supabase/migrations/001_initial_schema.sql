-- Ananta Stock — Schéma SaaS complet pour un nouveau projet Supabase
-- À exécuter une seule fois dans le SQL Editor d'un projet vide.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.membership_role as enum ('owner', 'manager', 'seller');
create type public.stock_kind as enum ('commercialise', 'outil');
create type public.movement_type as enum ('entree', 'vente', 'sortie', 'perte', 'ajustement');
create type public.sale_status as enum ('completed', 'cancelled');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.activity_type as enum (
  'sale',
  'stock_update',
  'user_invited',
  'user_activated',
  'user_deactivated',
  'session_started',
  'session_ended'
);

-- ---------------------------------------------------------------------------
-- Entreprises, magasins et utilisateurs
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique,
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'past_due', 'cancelled')),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  currency char(3) not null default 'XAF',
  timezone text not null default 'Africa/Brazzaville',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid,
  role public.membership_role not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete restrict,
  check (role <> 'seller' or store_id is not null)
);

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  email text not null,
  role public.membership_role not null,
  token_hash bytea not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  check (role <> 'owner'),
  check (role <> 'seller' or store_id is not null)
);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_note text,
  closed_note text,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  check (closed_at is null or closed_at >= opened_at)
);

create unique index work_sessions_one_open_per_user_idx
  on public.work_sessions (organization_id, user_id)
  where closed_at is null;

-- ---------------------------------------------------------------------------
-- Catalogue et stock
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  category_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 160),
  brand text not null check (char_length(trim(brand)) between 1 and 100),
  sku text,
  kind public.stock_kind not null default 'commercialise',
  unit text not null check (char_length(trim(unit)) between 1 and 40),
  threshold numeric(14,3) not null default 0 check (threshold >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  foreign key (category_id, organization_id)
    references public.categories(id, organization_id) on delete restrict,
  unique (store_id, sku)
);

create unique index items_store_name_brand_unique_idx
  on public.items (store_id, lower(name), lower(brand));

create index items_search_idx
  on public.items (organization_id, store_id, lower(name), lower(brand));

create table public.stock_levels (
  item_id uuid primary key references public.items(id) on delete cascade,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ventes et mouvements
-- ---------------------------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  status public.sale_status not null default 'completed',
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  idempotency_key uuid not null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  item_id uuid not null references public.items(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete restrict,
  type public.movement_type not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  quantity_before numeric(14,3) not null check (quantity_before >= 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  reason text,
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key)
);

create table public.user_activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  type public.activity_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_idx
  on public.memberships (user_id, organization_id);
create index memberships_store_idx
  on public.memberships (store_id) where active = true;
create index categories_org_idx
  on public.categories (organization_id);
create index sales_store_created_idx
  on public.sales (store_id, created_at desc);
create index sales_seller_created_idx
  on public.sales (seller_id, created_at desc);
create index sale_items_sale_idx
  on public.sale_items (sale_id);
create index movements_store_created_idx
  on public.inventory_movements (store_id, created_at desc);
create index movements_item_created_idx
  on public.inventory_movements (item_id, created_at desc);
create index activity_org_created_idx
  on public.user_activity_logs (organization_id, created_at desc);
create index work_sessions_user_opened_idx
  on public.work_sessions (user_id, opened_at desc);

-- ---------------------------------------------------------------------------
-- Fonctions de sécurité
-- ---------------------------------------------------------------------------

create or replace function public.current_membership_role(target_organization_id uuid)
returns public.membership_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.memberships
  where organization_id = target_organization_id
    and user_id = (select auth.uid())
    and active = true
  limit 1;
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_membership_role(target_organization_id) is not null;
$$;

create or replace function public.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_membership_role(target_organization_id) = 'owner';
$$;

create or replace function public.can_manage_users(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_membership_role(target_organization_id)
    in ('owner', 'manager');
$$;

create or replace function public.can_manage_catalog(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_membership_role(target_organization_id)
    in ('owner', 'manager');
$$;

create or replace function public.can_access_store(
  target_organization_id uuid,
  target_store_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and active = true
      and (
        role in ('owner', 'manager')
        or store_id = target_store_id
      )
  );
$$;

create or replace function public.shares_organization(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.active = true
      and theirs.user_id = target_user_id
      and theirs.active = true
  );
$$;

-- ---------------------------------------------------------------------------
-- Fonctions et triggers techniques
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute procedure public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger stores_set_updated_at
before update on public.stores
for each row execute procedure public.set_updated_at();

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute procedure public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute procedure public.set_updated_at();

create trigger items_set_updated_at
before update on public.items
for each row execute procedure public.set_updated_at();

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(lower(new.email), ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when excluded.full_name <> '' then excluded.full_name
      else public.profiles.full_name
    end,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_profile_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_auth_user_profile();

-- Rattrape les comptes éventuellement créés avant l'installation du schéma.
insert into public.profiles (id, email, full_name)
select
  id,
  coalesce(lower(email), ''),
  coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

create or replace function public.initialize_stock_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (item_id, quantity)
  values (new.id, 0)
  on conflict (item_id) do nothing;

  return new;
end;
$$;

create trigger on_item_created
after insert on public.items
for each row execute procedure public.initialize_stock_level();

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removing_owner boolean;
  active_owner_count integer;
begin
  if tg_op = 'DELETE' then
    removing_owner := old.role = 'owner' and old.active = true;
  else
    removing_owner :=
      old.role = 'owner'
      and old.active = true
      and (
        new.role <> 'owner'
        or new.active = false
        or new.organization_id <> old.organization_id
      );
  end if;

  if removing_owner then
    select count(*)
    into active_owner_count
    from public.memberships
    where organization_id = old.organization_id
      and role = 'owner'
      and active = true;

    if active_owner_count <= 1 then
      raise exception 'An organization must keep at least one active owner';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger memberships_protect_last_owner
before update or delete on public.memberships
for each row execute procedure public.protect_last_owner();

-- ---------------------------------------------------------------------------
-- Création d'entreprise et gestion des invitations
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  organization_name text,
  store_name text
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(organization_name)) < 2 then
    raise exception 'Organization name is too short';
  end if;

  generated_slug :=
    trim(both '-' from regexp_replace(lower(trim(organization_name)), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.organizations (name, slug)
  values (trim(organization_name), generated_slug)
  returning id into new_organization_id;

  insert into public.stores (organization_id, name)
  values (new_organization_id, trim(store_name))
  returning id into new_store_id;

  insert into public.memberships (
    organization_id,
    user_id,
    store_id,
    role,
    created_by
  )
  values (
    new_organization_id,
    auth.uid(),
    new_store_id,
    'owner',
    auth.uid()
  );

  return new_organization_id;
end;
$$;

create or replace function public.create_user_invitation(
  target_organization_id uuid,
  target_store_id uuid,
  target_email text,
  target_role public.membership_role,
  raw_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role public.membership_role;
  invitation_id uuid;
begin
  caller_role := public.current_membership_role(target_organization_id);

  if caller_role is null then
    raise exception 'Permission denied';
  end if;

  if target_role = 'owner' then
    raise exception 'Owners cannot be invited through this function';
  end if;

  if caller_role = 'manager' and target_role <> 'seller' then
    raise exception 'Managers can only invite sellers';
  end if;

  if target_role = 'seller' and target_store_id is null then
    raise exception 'A seller must be assigned to a store';
  end if;

  if char_length(trim(raw_token)) < 32 then
    raise exception 'Invitation token is too short';
  end if;

  update public.user_invitations
  set status = 'revoked'
  where organization_id = target_organization_id
    and lower(email) = lower(trim(target_email))
    and status = 'pending';

  insert into public.user_invitations (
    organization_id,
    store_id,
    email,
    role,
    token_hash,
    invited_by
  )
  values (
    target_organization_id,
    target_store_id,
    lower(trim(target_email)),
    target_role,
    digest(raw_token, 'sha256'),
    auth.uid()
  )
  returning id into invitation_id;

  insert into public.user_activity_logs (
    organization_id,
    store_id,
    user_id,
    type,
    metadata
  )
  values (
    target_organization_id,
    target_store_id,
    auth.uid(),
    'user_invited',
    jsonb_build_object(
      'email', lower(trim(target_email)),
      'role', target_role
    )
  );

  return invitation_id;
end;
$$;

create or replace function public.accept_user_invitation(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_invitations;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  authenticated_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select *
  into invitation
  from public.user_invitations
  where token_hash = digest(raw_token, 'sha256')
    and status = 'pending'
    and expires_at > now()
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;

  if authenticated_email <> lower(invitation.email) then
    raise exception 'Invitation email does not match authenticated user';
  end if;

  insert into public.memberships (
    organization_id,
    user_id,
    store_id,
    role,
    created_by
  )
  values (
    invitation.organization_id,
    auth.uid(),
    invitation.store_id,
    invitation.role,
    invitation.invited_by
  );

  update public.user_invitations
  set
    status = 'accepted',
    accepted_by = auth.uid(),
    accepted_at = now()
  where id = invitation.id;

  return invitation.organization_id;
end;
$$;

create or replace function public.set_membership_active(
  target_organization_id uuid,
  target_user_id uuid,
  new_active_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role public.membership_role;
  target_membership public.memberships;
begin
  caller_role := public.current_membership_role(target_organization_id);

  select *
  into target_membership
  from public.memberships
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if target_membership.user_id is null then
    raise exception 'Membership not found';
  end if;

  if caller_role = 'manager' and target_membership.role <> 'seller' then
    raise exception 'Managers can only manage sellers';
  end if;

  if caller_role <> 'owner' and caller_role <> 'manager' then
    raise exception 'Permission denied';
  end if;

  update public.memberships
  set active = new_active_value
  where organization_id = target_organization_id
    and user_id = target_user_id;

  insert into public.user_activity_logs (
    organization_id,
    store_id,
    user_id,
    type,
    metadata
  )
  values (
    target_organization_id,
    target_membership.store_id,
    auth.uid(),
    case
      when new_active_value then 'user_activated'::public.activity_type
      else 'user_deactivated'::public.activity_type
    end,
    jsonb_build_object('target_user_id', target_user_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Horaires des vendeurs
-- ---------------------------------------------------------------------------

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

  insert into public.work_sessions (
    organization_id,
    store_id,
    user_id,
    opened_note
  )
  values (
    target_store.organization_id,
    target_store.id,
    auth.uid(),
    nullif(trim(session_note), '')
  )
  returning * into result;

  insert into public.user_activity_logs (
    organization_id,
    store_id,
    user_id,
    type,
    metadata
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

create or replace function public.end_work_session(
  target_session_id uuid,
  session_note text default null
)
returns public.work_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.work_sessions;
  result public.work_sessions;
begin
  select *
  into target_session
  from public.work_sessions
  where id = target_session_id
    and closed_at is null
  for update;

  if target_session.id is null then
    raise exception 'Open session not found';
  end if;

  if target_session.user_id <> auth.uid()
    and not public.can_manage_users(target_session.organization_id)
  then
    raise exception 'Permission denied';
  end if;

  update public.work_sessions
  set
    closed_at = now(),
    closed_note = nullif(trim(session_note), '')
  where id = target_session.id
  returning * into result;

  insert into public.user_activity_logs (
    organization_id,
    store_id,
    user_id,
    type,
    metadata
  )
  values (
    target_session.organization_id,
    target_session.store_id,
    auth.uid(),
    'session_ended',
    jsonb_build_object(
      'session_id', result.id,
      'session_user_id', result.user_id
    )
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vente rapide atomique
-- ---------------------------------------------------------------------------

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
    or not public.can_access_store(target_item.organization_id, target_item.store_id)
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
    unit_price
  )
  values (
    result.id,
    target_item.id,
    quantity_sold,
    target_item.selling_price
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
      'amount', result.total_amount
    )
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mouvements manuels réservés aux propriétaires et gestionnaires
-- ---------------------------------------------------------------------------

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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if movement = 'vente' then
    raise exception 'Use record_sale for sales';
  end if;

  select *
  into target_item
  from public.items
  where id = target_item_id
    and active = true;

  if target_item.id is null
    or not public.can_manage_catalog(target_item.organization_id)
  then
    raise exception 'Item not found';
  end if;

  if movement = 'ajustement' and quantity_value < 0 then
    raise exception 'Stock cannot be negative';
  end if;

  if movement <> 'ajustement' and quantity_value <= 0 then
    raise exception 'Quantity must be positive';
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

  signed_delta := case
    when movement = 'entree' then quantity_value
    when movement = 'ajustement' then quantity_value - current_quantity
    else -quantity_value
  end;

  if signed_delta = 0 then
    raise exception 'Movement does not change stock';
  end if;

  if current_quantity + signed_delta < 0 then
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
    movement,
    signed_delta,
    current_quantity,
    current_quantity + signed_delta,
    nullif(trim(movement_reason), ''),
    request_id,
    auth.uid()
  )
  returning * into result;

  update public.stock_levels
  set
    quantity = result.quantity_after,
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
      'movement_type', movement,
      'quantity_delta', signed_delta
    )
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.memberships enable row level security;
alter table public.user_invitations enable row level security;
alter table public.work_sessions enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.stock_levels enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.user_activity_logs enable row level security;

create policy "members read organizations"
on public.organizations for select
to authenticated
using (public.is_organization_member(id));

create policy "owners update organizations"
on public.organizations for update
to authenticated
using (public.is_organization_owner(id))
with check (public.is_organization_owner(id));

create policy "users read related profiles"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or public.shares_organization(id)
);

create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "members read accessible stores"
on public.stores for select
to authenticated
using (public.can_access_store(organization_id, id));

create policy "managers create stores"
on public.stores for insert
to authenticated
with check (public.can_manage_catalog(organization_id));

create policy "managers update stores"
on public.stores for update
to authenticated
using (public.can_manage_catalog(organization_id))
with check (public.can_manage_catalog(organization_id));

create policy "owners delete stores"
on public.stores for delete
to authenticated
using (public.is_organization_owner(organization_id));

create policy "members read memberships"
on public.memberships for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "owners and managers create permitted memberships"
on public.memberships for insert
to authenticated
with check (
  public.is_organization_owner(organization_id)
  or (
    public.current_membership_role(organization_id) = 'manager'
    and role = 'seller'
  )
);

create policy "owners and managers update permitted memberships"
on public.memberships for update
to authenticated
using (
  public.is_organization_owner(organization_id)
  or (
    public.current_membership_role(organization_id) = 'manager'
    and role = 'seller'
  )
)
with check (
  public.is_organization_owner(organization_id)
  or (
    public.current_membership_role(organization_id) = 'manager'
    and role = 'seller'
  )
);

create policy "owners and managers delete permitted memberships"
on public.memberships for delete
to authenticated
using (
  public.is_organization_owner(organization_id)
  or (
    public.current_membership_role(organization_id) = 'manager'
    and role = 'seller'
  )
);

create policy "managers read invitations"
on public.user_invitations for select
to authenticated
using (public.can_manage_users(organization_id));

create policy "users read permitted work sessions"
on public.work_sessions for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_users(organization_id)
);

create policy "members read categories"
on public.categories for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "managers create categories"
on public.categories for insert
to authenticated
with check (public.can_manage_catalog(organization_id));

create policy "managers update categories"
on public.categories for update
to authenticated
using (public.can_manage_catalog(organization_id))
with check (public.can_manage_catalog(organization_id));

create policy "managers delete categories"
on public.categories for delete
to authenticated
using (public.can_manage_catalog(organization_id));

create policy "members read accessible items"
on public.items for select
to authenticated
using (public.can_access_store(organization_id, store_id));

create policy "managers create items"
on public.items for insert
to authenticated
with check (public.can_manage_catalog(organization_id));

create policy "managers update items"
on public.items for update
to authenticated
using (public.can_manage_catalog(organization_id))
with check (public.can_manage_catalog(organization_id));

create policy "managers delete items"
on public.items for delete
to authenticated
using (public.can_manage_catalog(organization_id));

create policy "members read accessible stock"
on public.stock_levels for select
to authenticated
using (
  exists (
    select 1
    from public.items
    where items.id = stock_levels.item_id
      and public.can_access_store(items.organization_id, items.store_id)
  )
);

create policy "users read permitted sales"
on public.sales for select
to authenticated
using (
  public.can_access_store(organization_id, store_id)
  and (
    public.current_membership_role(organization_id) in ('owner', 'manager')
    or seller_id = (select auth.uid())
  )
);

create policy "users read permitted sale items"
on public.sale_items for select
to authenticated
using (
  exists (
    select 1
    from public.sales
    where sales.id = sale_items.sale_id
  )
);

create policy "users read permitted movements"
on public.inventory_movements for select
to authenticated
using (
  public.can_access_store(organization_id, store_id)
  and (
    public.current_membership_role(organization_id) in ('owner', 'manager')
    or created_by = (select auth.uid())
  )
);

create policy "users read permitted activity"
on public.user_activity_logs for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_users(organization_id)
);

-- ---------------------------------------------------------------------------
-- Droits SQL
-- ---------------------------------------------------------------------------

revoke all on table public.organizations from anon;
revoke all on table public.profiles from anon;
revoke all on table public.stores from anon;
revoke all on table public.memberships from anon;
revoke all on table public.user_invitations from anon;
revoke all on table public.work_sessions from anon;
revoke all on table public.categories from anon;
revoke all on table public.items from anon;
revoke all on table public.stock_levels from anon;
revoke all on table public.sales from anon;
revoke all on table public.sale_items from anon;
revoke all on table public.inventory_movements from anon;
revoke all on table public.user_activity_logs from anon;

grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.user_invitations to authenticated;
grant select on public.work_sessions to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select on public.stock_levels to authenticated;
grant select on public.sales to authenticated;
grant select on public.sale_items to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.user_activity_logs to authenticated;

revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.create_user_invitation(uuid, uuid, text, public.membership_role, text) from public, anon;
revoke execute on function public.accept_user_invitation(text) from public, anon;
revoke execute on function public.set_membership_active(uuid, uuid, boolean) from public, anon;
revoke execute on function public.start_work_session(uuid, text) from public, anon;
revoke execute on function public.end_work_session(uuid, text) from public, anon;
revoke execute on function public.record_sale(uuid, numeric, uuid) from public, anon;
revoke execute on function public.record_inventory_movement(uuid, public.movement_type, numeric, text, uuid) from public, anon;

grant execute on function public.current_membership_role(uuid) to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_owner(uuid) to authenticated;
grant execute on function public.can_manage_users(uuid) to authenticated;
grant execute on function public.can_manage_catalog(uuid) to authenticated;
grant execute on function public.can_access_store(uuid, uuid) to authenticated;
grant execute on function public.shares_organization(uuid) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.create_user_invitation(uuid, uuid, text, public.membership_role, text) to authenticated;
grant execute on function public.accept_user_invitation(text) to authenticated;
grant execute on function public.set_membership_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.start_work_session(uuid, text) to authenticated;
grant execute on function public.end_work_session(uuid, text) to authenticated;
grant execute on function public.record_sale(uuid, numeric, uuid) to authenticated;
grant execute on function public.record_inventory_movement(uuid, public.movement_type, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vues pour le dashboard
-- Les vues security_invoker respectent les politiques RLS des tables sources.
-- ---------------------------------------------------------------------------

create view public.stock_overview
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
  end as stock_status
from public.items i
left join public.stock_levels sl on sl.item_id = i.id
where i.active = true;

create view public.daily_seller_performance
with (security_invoker = true)
as
select
  s.organization_id,
  s.store_id,
  s.seller_id,
  p.full_name as seller_name,
  (s.created_at at time zone st.timezone)::date as sale_date,
  count(distinct s.id) as sales_count,
  sum(si.quantity) as units_sold,
  sum(si.line_total) as revenue
from public.sales s
join public.sale_items si on si.sale_id = s.id
join public.profiles p on p.id = s.seller_id
join public.stores st on st.id = s.store_id
where s.status = 'completed'
group by
  s.organization_id,
  s.store_id,
  s.seller_id,
  p.full_name,
  (s.created_at at time zone st.timezone)::date;

create view public.daily_work_hours
with (security_invoker = true)
as
select
  ws.organization_id,
  ws.store_id,
  ws.user_id,
  p.full_name,
  (ws.opened_at at time zone st.timezone)::date as work_date,
  min(ws.opened_at) as first_arrival,
  max(ws.closed_at) as last_departure,
  round(
    sum(
      extract(
        epoch from (coalesce(ws.closed_at, now()) - ws.opened_at)
      )
    ) / 3600,
    2
  ) as hours_worked
from public.work_sessions ws
join public.profiles p on p.id = ws.user_id
join public.stores st on st.id = ws.store_id
group by
  ws.organization_id,
  ws.store_id,
  ws.user_id,
  p.full_name,
  (ws.opened_at at time zone st.timezone)::date;

grant select on public.stock_overview to authenticated;
grant select on public.daily_seller_performance to authenticated;
grant select on public.daily_work_hours to authenticated;