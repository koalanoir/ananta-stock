-- Cycle de vie des comptes :
-- - choix du type d'activité à la création seulement ;
-- - suspension/réactivation réservée à l'administrateur de plateforme ;
-- - suppression atomique de toutes les données d'une organisation.

alter table public.organizations
  add column if not exists access_enabled boolean not null default true;

create index if not exists organizations_access_enabled_idx
  on public.organizations (access_enabled);

create or replace function public.enforce_platform_business_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role()::text, '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.business_type not in ('retail', 'restaurant') then
      raise exception 'Unsupported business type';
    end if;

    return new;
  end if;

  if new.business_type is distinct from old.business_type then
    raise exception
      'Le type d''activité peut uniquement être modifié par l''administrateur de la plateforme.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_platform_account_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.access_enabled is distinct from old.access_enabled
    and coalesce(auth.role()::text, '') <> 'service_role'
  then
    raise exception
      'L''accès au compte peut uniquement être modifié par l''administrateur de la plateforme.';
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_enforce_platform_account_access
on public.organizations;

create trigger organizations_enforce_platform_account_access
before update of access_enabled on public.organizations
for each row
execute procedure public.enforce_platform_account_access();

revoke all on function public.enforce_platform_account_access()
from public;

-- Toutes les fonctions RLS historiques passent par current_membership_role.
-- En intégrant l'état du compte ici, une suspension bloque aussi les accès
-- directs à l'API Supabase et pas uniquement la navigation dans le front.
create or replace function public.current_membership_role(
  target_organization_id uuid
)
returns public.membership_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id
  where membership.organization_id = target_organization_id
    and membership.user_id = (select auth.uid())
    and membership.active = true
    and organization.access_enabled = true
  limit 1;
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
    from public.memberships membership
    join public.organizations organization
      on organization.id = membership.organization_id
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.active = true
      and organization.access_enabled = true
      and (
        membership.role in ('owner', 'manager')
        or membership.store_id = target_store_id
      )
  );
$$;

create or replace function public.shares_organization(
  target_user_id uuid
)
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
    join public.organizations organization
      on organization.id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.active = true
      and theirs.user_id = target_user_id
      and theirs.active = true
      and organization.access_enabled = true
  );
$$;

-- Un utilisateur suspendu peut uniquement relire sa propre adhésion pendant
-- la tentative de connexion. Toutes les données métier restent protégées par
-- les helpers RLS ci-dessus.
drop policy if exists "members read memberships"
on public.memberships;

create policy "members read memberships"
on public.memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_organization_member(organization_id)
);

drop policy if exists account_settings_select_members
on public.account_settings;

create policy account_settings_select_members
on public.account_settings for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "users read permitted work sessions"
on public.work_sessions;

create policy "users read permitted work sessions"
on public.work_sessions for select
to authenticated
using (
  public.is_organization_member(organization_id)
  and (
    user_id = (select auth.uid())
    or public.can_manage_users(organization_id)
  )
);

drop policy if exists "users read permitted activity"
on public.user_activity_logs;

create policy "users read permitted activity"
on public.user_activity_logs for select
to authenticated
using (
  public.is_organization_member(organization_id)
  and (
    user_id = (select auth.uid())
    or public.can_manage_users(organization_id)
  )
);

drop policy if exists notifications_select_recipient
on public.notifications;

create policy notifications_select_recipient
on public.notifications for select
to authenticated
using (
  recipient_id = (select auth.uid())
  and public.is_organization_member(organization_id)
);

create or replace function public.delete_organization_cascade(
  target_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'Platform administrator privileges are required';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
  ) then
    raise exception 'Organization not found';
  end if;

  delete from public.goods_receipt_items receipt_item
  using public.goods_receipts receipt
  where receipt_item.goods_receipt_id = receipt.id
    and receipt.organization_id = target_organization_id;

  delete from public.goods_receipts
  where organization_id = target_organization_id;

  delete from public.purchase_order_items order_item
  using public.purchase_orders purchase_order
  where order_item.purchase_order_id = purchase_order.id
    and purchase_order.organization_id = target_organization_id;

  delete from public.notifications
  where organization_id = target_organization_id;

  delete from public.purchase_orders
  where organization_id = target_organization_id;

  delete from public.suppliers
  where organization_id = target_organization_id;

  delete from public.invoice_items invoice_item
  using public.invoices invoice
  where invoice_item.invoice_id = invoice.id
    and invoice.organization_id = target_organization_id;

  delete from public.customer_order_items order_item
  using public.customer_orders customer_order
  where order_item.customer_order_id = customer_order.id
    and customer_order.organization_id = target_organization_id;

  delete from public.menu_item_ingredients ingredient
  using public.menu_items menu_item
  where ingredient.menu_item_id = menu_item.id
    and menu_item.organization_id = target_organization_id;

  delete from public.inventory_movements
  where organization_id = target_organization_id;

  delete from public.invoices
  where organization_id = target_organization_id;

  delete from public.customer_orders
  where organization_id = target_organization_id;

  delete from public.customers
  where organization_id = target_organization_id;

  delete from public.sale_items sale_item
  using public.sales sale
  where sale_item.sale_id = sale.id
    and sale.organization_id = target_organization_id;

  delete from public.sales
  where organization_id = target_organization_id;

  delete from public.menu_items
  where organization_id = target_organization_id;

  delete from public.stock_levels stock
  using public.items item
  where stock.item_id = item.id
    and item.organization_id = target_organization_id;

  delete from public.items
  where organization_id = target_organization_id;

  delete from public.categories
  where organization_id = target_organization_id;

  delete from public.work_sessions
  where organization_id = target_organization_id;

  delete from public.user_activity_logs
  where organization_id = target_organization_id;

  delete from public.user_invitations
  where organization_id = target_organization_id;

  delete from public.memberships
  where organization_id = target_organization_id;

  delete from public.stores
  where organization_id = target_organization_id;

  delete from public.account_settings
  where organization_id = target_organization_id;

  delete from public.organizations
  where id = target_organization_id;
end;
$$;

revoke all on function public.delete_organization_cascade(uuid)
from public, anon, authenticated;

grant execute on function public.delete_organization_cascade(uuid)
to service_role;
