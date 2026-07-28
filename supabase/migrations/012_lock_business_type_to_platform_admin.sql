-- Le type d'activité est une configuration de plateforme.
-- Les propriétaires et gestionnaires ne peuvent plus appeler directement
-- la fonction historique ; l'API administrateur utilise la service role.
revoke execute on function public.set_store_business_type(uuid, text)
from authenticated;

revoke execute on function public.set_store_business_type(uuid, text)
from anon;

revoke execute on function public.set_store_business_type(uuid, text)
from public;

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
    new.business_type := 'retail';
    return new;
  end if;

  if new.business_type is distinct from old.business_type then
    raise exception
      'Le type d''activité peut uniquement être modifié par l''administrateur de la plateforme.';
  end if;

  return new;
end;
$$;

drop trigger if exists stores_enforce_platform_business_type
on public.stores;

create trigger stores_enforce_platform_business_type
before insert or update of business_type on public.stores
for each row
execute procedure public.enforce_platform_business_type();

revoke all on function public.enforce_platform_business_type()
from public;
