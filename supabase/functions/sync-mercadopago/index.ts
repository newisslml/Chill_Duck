// Trae tus pagos de Mercado Pago desde la API y los registra (con categoría y notificación).
// La llama pg_cron cada 2 minutos (supabase/cron/sync-mercadopago.sql).
//
// POST /functions/v1/sync-mercadopago   cabecera x-ingest-token: <token de Ajustes>
//   { "days"?: 3, "silent"?: false }   ← `days` hacia atrás; `silent` para cargar historial sin avisos
// Requiere el secreto MP_ACCESS_TOKEN (Access Token de producción de tu cuenta).

import { json, serviceClient, settingsForRequest } from '../_shared/db.ts';
import { classifyPayment, type MpPayment } from '../_shared/mercadopago.ts';
import { loadRules, recordPayment } from '../_shared/record.ts';

const API = 'https://api.mercadopago.com';
const PAGE = 100;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);

  const db = serviceClient();
  const settings = await settingsForRequest(db, req);
  if (!settings) return json({ error: 'Token inválido' }, 401);
  if (!settings.mp_enabled) return json({ status: 'disabled', reason: 'Mercado Pago está desactivado en Ajustes' });
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) return json({ status: 'disabled', reason: 'Falta el secreto MP_ACCESS_TOKEN' });

  const params = await req.json().catch(() => ({}));
  const days = Math.min(120, Math.max(1, Number(params.days) || 3));
  const silent = params.silent === true;

  // deno-lint-ignore no-explicit-any
  const mp = async (path: string): Promise<any> => {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };

  const summary = {
    at: new Date().toISOString(),
    days,
    fetched: 0,
    created: 0,
    merged: 0,
    removed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const me = await mp('/users/me');
    const since = encodeURIComponent(new Date(Date.now() - days * 86_400_000).toISOString());
    const rules = await loadRules(db, settings.user_id);

    for (let offset = 0; offset < 3000; offset += PAGE) {
      const page = await mp(
        `/v1/payments/search?payer.id=${me.id}&range=date_created&begin_date=${since}&end_date=NOW` +
          `&sort=date_created&criteria=asc&limit=${PAGE}&offset=${offset}`,
      );
      const results: MpPayment[] = page.results ?? [];
      summary.fetched += results.length;

      for (const payment of results) {
        const decision = classifyPayment(payment, me.id);
        if (decision.kind === 'skip') {
          summary.skipped++;
        } else if (decision.kind === 'remove') {
          const { data, error } = await db
            .from('transactions')
            .delete()
            .eq('user_id', settings.user_id)
            .eq('external_ref', decision.externalRef)
            .select('id');
          if (error) throw error;
          summary.removed += data?.length ?? 0;
        } else {
          const result = await recordPayment(db, settings, decision.candidate, { silent, rules });
          if (result.status === 'created') summary.created++;
          else if (result.status === 'merged') summary.merged++;
        }
      }
      if (results.length < PAGE) break;
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err));
  }

  await db.from('settings').update({ mp_sync: summary }).eq('user_id', settings.user_id);
  return json(summary, summary.errors.length ? 502 : 200);
});
