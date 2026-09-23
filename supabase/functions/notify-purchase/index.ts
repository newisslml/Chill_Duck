// Aviso push de un gasto que ingresaste a mano en la app (botón +), igual que los automáticos.
//
// POST /functions/v1/notify-purchase   cabecera Authorization: Bearer <sesión de la app>
//   { "id": "<id del movimiento>" }
// Responde { status: "sent" | "duplicate" }.

import { json, serviceClient, type SettingsRow } from '../_shared/db.ts';
import { notifyPurchase } from '../_shared/record.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200): Response {
  const res = json(body, status);
  for (const [key, value] of Object.entries(CORS)) res.headers.set(key, value);
  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Usa POST' }, 405);

  const db = serviceClient();
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  if (!auth.user) return reply({ error: 'Sesión inválida' }, 401);
  const userId = auth.user.id;

  const { id } = await req.json().catch(() => ({ id: null }));
  if (typeof id !== 'string' || !id) return reply({ error: 'Falta el id del movimiento' }, 400);

  const [{ data: tx, error: txError }, { data: settings, error: settingsError }] = await Promise.all([
    db
      .from('transactions')
      .select('id, method, merchant, amount, installments, purchased_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
    db.from('settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (txError) throw txError;
  if (settingsError) throw settingsError;
  if (!tx || !settings) return reply({ error: 'Movimiento no encontrado' }, 404);

  // Un reintento de la app no debe repetir el aviso.
  const { data: already } = await db
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('tag', tx.id)
    .limit(1)
    .maybeSingle();
  if (already) return reply({ status: 'duplicate' });

  await notifyPurchase(db, settings as SettingsRow, tx);
  return reply({ status: 'sent' });
});
