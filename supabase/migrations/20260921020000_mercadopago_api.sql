-- Pagos sincronizados desde la API de Mercado Pago (función `sync-mercadopago`).
alter type public.tx_source add value if not exists 'api';

-- Última sincronización con Mercado Pago: { at, days, fetched, created, merged, removed, skipped, errors }.
alter table public.settings add column mp_sync jsonb;

-- Avisos externos (correo, API) que ya se borraron: las sincronizaciones no los vuelven a crear.
create table public.dismissed_refs (
  user_id uuid not null references auth.users on delete cascade,
  external_ref text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, external_ref)
);

alter table public.dismissed_refs enable row level security;
create policy "descartes propios visibles" on public.dismissed_refs
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.dismissed_refs to authenticated;
grant all on public.dismissed_refs to service_role;

create function public.remember_dismissed_ref() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.dismissed_refs (user_id, external_ref)
  values (old.user_id, old.external_ref)
  on conflict do nothing;
  return old;
end;
$$;

create trigger transactions_remember_dismissed
  after delete on public.transactions
  for each row when (old.external_ref is not null)
  execute function public.remember_dismissed_ref();
