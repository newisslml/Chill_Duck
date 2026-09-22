-- Perfil (alias, onboarding) y métodos de pago activables desde Ajustes.

alter table public.settings
  add column alias text,
  add column onboarded_at timestamptz,
  -- Apagar un método detiene la captura de pagos nuevos (Atajos / API), pero no borra su historial.
  add column cmr_enabled boolean not null default true,
  add column mp_enabled boolean not null default true;
