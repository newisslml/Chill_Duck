-- Programa la sincronización con Mercado Pago cada 2 minutos.
-- No es una migración porque depende de la URL del proyecto. Se aplica con:
--   sed "s#{{SUPABASE_URL}}#https://<ref>.supabase.co#" supabase/cron/sync-mercadopago.sql \
--     | npx supabase db query --linked -f /dev/stdin
-- Para detenerla:  select cron.unschedule('sync-mercadopago');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'sync-mercadopago';

select cron.schedule(
  'sync-mercadopago',
  '*/2 * * * *',
  $job$
    select net.http_post(
      url := '{{SUPABASE_URL}}/functions/v1/sync-mercadopago',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', s.ingest_token),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    from public.settings s;
  $job$
);
