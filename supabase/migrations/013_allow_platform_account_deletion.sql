-- La suppression complète d'un compte par l'administrateur de plateforme
-- supprime l'organisation puis ses adhésions via ON DELETE CASCADE.
-- Le garde-fou du dernier propriétaire reste actif pour les utilisateurs,
-- mais ne doit pas bloquer une opération privilégiée exécutée avec la
-- service role (utilisée uniquement par l'API d'administration).
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
  if coalesce(auth.role()::text, '') = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

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

revoke all on function public.protect_last_owner()
from public;
