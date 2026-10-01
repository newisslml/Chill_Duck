-- En CMR, una compra en cuotas empieza a cobrarse en el estado de cuenta siguiente al que le toca por
-- fecha: lo comprado el 20 de agosto (ciclo de agosto) trae su cuota 1 en septiembre, la 2 en octubre
-- y la 3 en noviembre. Una compra en 1 cuota (al contado) se cobra en el ciclo de la compra, y Mercado
-- Pago no cambia. Misma regla que `firstChargeDelay` en supabase/functions/_shared/domain.ts.

create or replace view public.month_charges with (security_invoker = true) as
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
  (
    public.month_of(t.purchased_at)
    + make_interval(months => g.i + case when t.method = 'cmr' and t.installments > 1 then 1 else 0 end)
  )::date as charge_month
from public.transactions t
cross join lateral generate_series(0, t.installments - 1) as g(i);
