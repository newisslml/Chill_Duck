-- Chill Duck · esquema inicial
-- Montos en pesos chilenos (CLP) como enteros. Los meses se cuentan en hora de Chile.

create type public.payment_method as enum ('cmr', 'mercadopago');
create type public.tx_source as enum ('email', 'apple_pay', 'manual');

-- ---------------------------------------------------------------------------
-- Categorías (catálogo fijo; íconos y nombres visibles en supabase/functions/_shared/domain.ts)

create table public.categories (
  id text primary key,
  name text not null,
  sort smallint not null
);

insert into public.categories (id, name, sort) values
  ('supermercado', 'Supermercado', 1),
  ('comida', 'Comida y delivery', 2),
  ('ropa', 'Ropa', 3),
  ('entretenimiento', 'Entretenimiento', 4),
  ('suscripciones', 'Suscripciones', 5),
  ('deudas', 'Deudas', 6),
  ('transporte', 'Transporte', 7),
  ('salud', 'Salud', 8),
  ('hogar', 'Hogar y servicios', 9),
  ('otros', 'Otros', 10);

-- ---------------------------------------------------------------------------
-- Ajustes: una fila por usuario

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  salary bigint not null default 0 check (salary >= 0),
  extra_income bigint not null default 0 check (extra_income >= 0),
  cap_total bigint not null default 0 check (cap_total >= 0),
  cap_cmr bigint not null default 0 check (cap_cmr >= 0),
  cap_mp bigint not null default 0 check (cap_mp >= 0),
  report_email text,
  apps_script_url text,
  -- Secreto que usan Apps Script y el Atajo de iOS para registrar pagos.
  ingest_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Movimientos

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  method public.payment_method not null,
  merchant text not null check (length(trim(merchant)) > 0),
  -- Monto total de la compra (si es en cuotas, cada mes carga amount / installments).
  amount bigint not null check (amount > 0),
  purchased_at timestamptz not null default now(),
  installments int not null default 1 check (installments between 1 and 48),
  category_id text not null default 'otros' references public.categories,
  -- true cuando ninguna regla reconoció el comercio: la app lo marca para revisar.
  needs_review boolean not null default false,
  note text,
  source public.tx_source not null default 'manual',
  -- Id del correo de Gmail: evita registrar dos veces el mismo aviso.
  external_ref text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, external_ref)
);

create index transactions_user_purchased_idx on public.transactions (user_id, purchased_at desc);

-- ---------------------------------------------------------------------------
-- Reglas comercio → categoría. user_id null = regla base.

create table public.merchant_rules (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users on delete cascade,
  pattern text not null check (pattern = upper(pattern) and length(pattern) >= 2),
  category_id text not null references public.categories,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, pattern)
);

insert into public.merchant_rules (user_id, pattern, category_id)
select null, p, c from (values
  ('LIDER', 'supermercado'), ('WALMART', 'supermercado'), ('JUMBO', 'supermercado'),
  ('UNIMARC', 'supermercado'), ('TOTTUS', 'supermercado'), ('SANTA ISABEL', 'supermercado'),
  ('ACUENTA', 'supermercado'), ('MAYORISTA 10', 'supermercado'), ('ALVI', 'supermercado'),
  ('OK MARKET', 'supermercado'), ('EKONO', 'supermercado'),

  ('RAPPI', 'comida'), ('PEDIDOSYA', 'comida'), ('UBER EATS', 'comida'), ('MCDONALDS', 'comida'),
  ('BURGER KING', 'comida'), ('STARBUCKS', 'comida'), ('JUAN MAESTRO', 'comida'), ('DOMINOS', 'comida'),
  ('PAPA JOHNS', 'comida'), ('TELEPIZZA', 'comida'), ('KFC', 'comida'), ('DOGGIS', 'comida'),

  ('H&M', 'ropa'), ('ZARA', 'ropa'), ('PARIS', 'ropa'), ('RIPLEY', 'ropa'), ('NIKE', 'ropa'),
  ('ADIDAS', 'ropa'), ('SHEIN', 'ropa'), ('TRICOT', 'ropa'), ('CORONA', 'ropa'), ('HUSH PUPPIES', 'ropa'),

  ('CINEMARK', 'entretenimiento'), ('CINEPOLIS', 'entretenimiento'), ('CINEPLANET', 'entretenimiento'),
  ('PUNTOTICKET', 'entretenimiento'), ('TICKETMASTER', 'entretenimiento'), ('PASSLINE', 'entretenimiento'),
  ('STEAM', 'entretenimiento'), ('PLAYSTATION', 'entretenimiento'), ('NINTENDO', 'entretenimiento'),
  ('XBOX', 'entretenimiento'),

  ('NETFLIX', 'suscripciones'), ('SPOTIFY', 'suscripciones'), ('DISNEY', 'suscripciones'),
  ('MAX', 'suscripciones'), ('HBO', 'suscripciones'), ('PRIME VIDEO', 'suscripciones'),
  ('AMAZON PRIME', 'suscripciones'), ('YOUTUBE', 'suscripciones'), ('APPLE.COM/BILL', 'suscripciones'),
  ('ICLOUD', 'suscripciones'), ('OPENAI', 'suscripciones'), ('CHATGPT', 'suscripciones'),
  ('GOOGLE ONE', 'suscripciones'), ('PARAMOUNT', 'suscripciones'), ('CRUNCHYROLL', 'suscripciones'),

  ('UBER', 'transporte'), ('DIDI', 'transporte'), ('CABIFY', 'transporte'), ('COPEC', 'transporte'),
  ('SHELL', 'transporte'), ('ARAMCO', 'transporte'), ('METRO', 'transporte'), ('BIP', 'transporte'),
  ('TURBUS', 'transporte'), ('PULLMAN', 'transporte'), ('AUTOPISTA', 'transporte'),

  ('CRUZ VERDE', 'salud'), ('SALCOBRAND', 'salud'), ('AHUMADA', 'salud'), ('DR SIMI', 'salud'),
  ('FARMACIA', 'salud'), ('CLINICA', 'salud'),

  ('ENEL', 'hogar'), ('AGUAS ANDINAS', 'hogar'), ('METROGAS', 'hogar'), ('ABASTIBLE', 'hogar'),
  ('LIPIGAS', 'hogar'), ('GASCO', 'hogar'), ('ENTEL', 'hogar'), ('MOVISTAR', 'hogar'), ('WOM', 'hogar'),
  ('CLARO', 'hogar'), ('VTR', 'hogar'), ('SODIMAC', 'hogar'), ('EASY', 'hogar'), ('IKEA', 'hogar')
) as seed(p, c);

-- ---------------------------------------------------------------------------
-- Suscripciones Web Push del iPhone

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Avisos que no se pudieron leer (formato de correo nuevo, monto ilegible, etc.)
create table public.ingest_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  source public.tx_source not null,
  error text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Foto del informe al cerrar el mes (no cambia si después editas el sueldo)
create table public.monthly_reports (
  user_id uuid not null references auth.users on delete cascade,
  month date not null check (extract(day from month) = 1),
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- ---------------------------------------------------------------------------
-- Cargos por mes: cada compra se expande en sus cuotas.
-- La cuota 1 cae en el mes de la compra; la última absorbe el resto de la división.

create function public.month_of(ts timestamptz) returns date
language sql immutable parallel safe set search_path = ''
as $$ select date_trunc('month', ts at time zone 'America/Santiago')::date $$;

create view public.month_charges with (security_invoker = true) as
select
  t.id as transaction_id,
  t.user_id,
  t.method,
  t.merchant,
  t.category_id,
  t.needs_review,
  t.purchased_at,
  t.source,
  t.note,
  t.installments,
  g.i + 1 as installment_no,
  t.amount as total,
  case
    when g.i = t.installments - 1 then t.amount - (t.amount / t.installments) * (t.installments - 1)
    else t.amount / t.installments
  end as charged,
  (public.month_of(t.purchased_at) + make_interval(months => g.i))::date as charge_month
from public.transactions t
cross join lateral generate_series(0, t.installments - 1) as g(i);

-- ---------------------------------------------------------------------------
-- Seguridad por fila: cada usuario ve solo lo suyo.

alter table public.categories enable row level security;
alter table public.settings enable row level security;
alter table public.transactions enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.ingest_errors enable row level security;
alter table public.monthly_reports enable row level security;

create policy "categorías visibles" on public.categories
  for select to authenticated using (true);

create policy "ajustes propios" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "movimientos propios" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "reglas base y propias visibles" on public.merchant_rules
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy "reglas propias editables" on public.merchant_rules
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reglas propias actualizables" on public.merchant_rules
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reglas propias borrables" on public.merchant_rules
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "suscripciones push propias" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "errores propios visibles" on public.ingest_errors
  for select to authenticated using (user_id = (select auth.uid()));
create policy "errores propios descartables" on public.ingest_errors
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "informes propios" on public.monthly_reports
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.categories to authenticated;
grant select, insert, update, delete on public.settings, public.transactions, public.merchant_rules,
  public.push_subscriptions to authenticated;
grant select, delete on public.ingest_errors to authenticated;
grant select on public.monthly_reports, public.month_charges to authenticated;
grant execute on function public.month_of(timestamptz) to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated, service_role;

-- Cambios en vivo para que la app se actualice al instante
alter publication supabase_realtime add table public.transactions;
