-- El mes de la app pasa a ser el mes de facturación de CMR: cierra el día 24 y se nombra por el mes en
-- que cierra. Lo comprado del 25 al fin de mes cuenta en el mes siguiente (el ciclo '2026-10' va del
-- 25 de septiembre al 24 de octubre). Aplica a CMR y a Mercado Pago por igual.
--
-- `charge_month` de la vista `month_charges` sale de esta función, así que basta con reemplazarla:
-- las compras ya guardadas se reubican solas. El 24 es BILLING_CLOSING_DAY en
-- supabase/functions/_shared/dates.ts; si lo cambias, cámbialo en los dos lados.

create or replace function public.month_of(ts timestamptz) returns date
language sql immutable parallel safe set search_path = ''
as $$
  select (
    date_trunc('month', ts at time zone 'America/Santiago')
    + case when extract(day from ts at time zone 'America/Santiago') > 24 then interval '1 month' else interval '0 days' end
  )::date
$$;
