-- Estado del script de Gmail (Apps Script), para saber desde la app si está corriendo.

alter table public.settings
  -- Último contacto de Apps Script (ping, revisión o diagnóstico).
  add column script_seen_at timestamptz,
  -- Resultado de la última revisión de correos: { at, found, sent, failed, results, errors }.
  add column last_scan jsonb,
  -- Salida de la función `diagnostico`: remitentes y asuntos de CMR / Mercado Pago encontrados.
  add column script_diagnostic jsonb;
