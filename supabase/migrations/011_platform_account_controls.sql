-- Configuration des comptes par l'administrateur de la plateforme.
-- À exécuter après 010_catalog_usage_and_business_onboarding.sql.

create table public.account_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  max_sellers integer not null default 5
    check (max_sellers between 0 and 500),
  retain_customer_orders boolean not null default true,
  retain_invoices boolean not null default true,
  feature_flags jsonb not null default jsonb_build_object(
    'performance', true,
    'stocks', true,
    'movements', true,
    'sales', true,
    'invoices', true,
    'customers', true,
    'supplier_orders', true,
    'stock_count', true,
    'restaurant_menu', true,
    'restaurant_pos', true,
    'restaurant_orders', true
  ),
  updated_at timestamptz not null default now(),
  constraint account_settings_feature_flags_object
    check (jsonb_typeof(feature_flags) = 'object')
);

insert into public.account_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.initialize_account_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_initialize_account_settings
after insert on public.organizations
for each row execute procedure public.initialize_account_settings();

create trigger account_settings_set_updated_at
before update on public.account_settings
for each row execute procedure public.set_updated_at();

alter table public.account_settings enable row level security;

create policy account_settings_select_members
on public.account_settings for select to authenticated
using (
  exists (
    select 1
    from public.memberships membership
    where membership.organization_id = account_settings.organization_id
      and membership.user_id = (select auth.uid())
      and membership.active = true
  )
);

create or replace function public.enforce_customer_order_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (
      select settings.retain_customer_orders
      from public.account_settings settings
      where settings.organization_id = new.organization_id
    ),
    true
  ) then
    raise exception 'Customer order storage is disabled for this account';
  end if;
  return new;
end;
$$;

create trigger customer_orders_enforce_retention
before insert on public.customer_orders
for each row execute procedure public.enforce_customer_order_retention();

create or replace function public.enforce_invoice_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (
      select settings.retain_invoices
      from public.account_settings settings
      where settings.organization_id = new.organization_id
    ),
    true
  ) then
    raise exception 'Invoice storage is disabled for this account';
  end if;
  return new;
end;
$$;

create trigger invoices_enforce_retention
before insert on public.invoices
for each row execute procedure public.enforce_invoice_retention();

revoke all on table public.account_settings from anon;
grant select on table public.account_settings to authenticated;
