-- Historial de notificaciones: cada push que envía Chill Duck queda guardado aquí
-- (lo escriben solo las Edge Functions; la app lo lee y lo marca como leído).

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  body text not null default '',
  -- Ruta de la app que se abre al tocarla.
  url text,
  tag text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notificaciones propias visibles" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notificaciones propias marcables" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notificaciones propias borrables" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, delete on public.notifications to authenticated;
-- Desde la app solo se puede marcar como leída, no cambiar el texto.
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;
