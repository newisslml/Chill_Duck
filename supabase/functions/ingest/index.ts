// Registra un pago que llega desde Gmail (Apps Script) o desde un Atajo de iOS.
//
// POST /functions/v1/ingest   cabecera x-ingest-token: <token de Ajustes>
//   { "source": "email", "messageId", "from", "subject", "date", "body", "silent"?, "shared"? }
//     shared: movimiento que te enviaste desde la app del banco (asunto "Pago CMR"); body = texto OCR de la imagen
//   { "source": "apple_pay", "amount": "$12.990", "merchant": "LIDER", "card": "CMR Mastercard" }
//   { "source": "manual", "amount": "8490", "merchant": "Starbucks", "method": "Mercado Pago", "installments"? }
//   { "source": "ping", "scan"?, "diagnostic"? }   ← estado de Apps Script; también mantiene activo Supabase
//
// Respuestas con status 200: created | merged | duplicate | ignored | error (aviso ilegible, queda en ingest_errors)

import { json, serviceClient, settingsForRequest } from '../_shared/db.ts';
import { METHODS, methodFromCardName, type Method } from '../_shared/domain.ts';
import { parseCLP } from '../_shared/money.ts';
import { parseEmail } from '../_shared/parsers/index.ts';
import { parseSharedEmail, sharedRef } from '../_shared/parsers/shared.ts';
import { notifyUser } from '../_shared/push.ts';
import { recordPayment, type PaymentCandidate } from '../_shared/record.ts';

type Parsed = { ok: true; candidate: PaymentCandidate } | { ok: false; reason: string };

// deno-lint-ignore no-explicit-any
function toCandidate(body: any): Parsed {
  if (body.source === 'email') {
    const email = {
      messageId: String(body.messageId ?? ''),
      from: String(body.from ?? ''),
      subject: String(body.subject ?? ''),
      date: String(body.date ?? new Date().toISOString()),
      body: String(body.body ?? ''),
    };
    const shared = body.shared === true;
    const result = shared ? parseSharedEmail(email) : parseEmail(email);
    if (result.kind === 'ignore') return { ok: false, reason: result.reason };
    return {
      ok: true,
      candidate: {
        method: result.method,
        merchant: result.merchant,
        amount: result.amount,
        purchasedAt: result.purchasedAt,
        installments: result.installments,
        source: 'email',
        externalRef: shared ? sharedRef(result) : body.messageId ? `gmail:${body.messageId}` : null,
        needsReview: result.needsReview,
        // El texto leído queda guardado para ajustar los patrones si el banco cambia el formato.
        raw: { from: body.from, subject: body.subject, date: body.date, body: email.body.slice(0, 2000) },
      },
    };
  }

  if (body.source === 'manual') {
    // Atajo "¿Cuánto pagaste?" (p. ej. al cerrar la app de Mercado Pago). Sin monto = no hubo pago.
    if (!/\d/.test(String(body.amount ?? ''))) return { ok: false, reason: 'Sin monto: no se registró nada' };
    const method: Method | null =
      body.method === 'cmr' || body.method === 'mercadopago' ? body.method : methodFromCardName(body.method);
    if (!method) return { ok: false, reason: `Método no reconocido: "${body.method ?? ''}"` };
    const amount = parseCLP(body.amount);
    if (amount <= 0) return { ok: false, reason: 'Monto en cero: no se registró nada' };
    const installments = Math.min(48, Math.max(1, Number.parseInt(String(body.installments ?? '1'), 10) || 1));
    return {
      ok: true,
      candidate: {
        method,
        merchant: String(body.merchant ?? '').trim() || `Pago con ${METHODS[method].name}`,
        amount,
        purchasedAt: new Date(),
        installments,
        source: 'manual',
        externalRef: null,
        raw: { method: body.method, amount: body.amount, merchant: body.merchant },
      },
    };
  }

  // apple_pay
  // El Atajo solo se activa con la CMR (la tarjeta de Mercado Pago no entra a Wallet en Chile),
  // así que un nombre de tarjeta que no dice "CMR" igual es la CMR. Queda guardado en `raw.card`.
  const method = methodFromCardName(body.card) ?? 'cmr';
  const amount = parseCLP(body.amount ?? '');
  if (amount <= 0) throw new Error(`Monto inválido: "${body.amount}"`);
  return {
    ok: true,
    candidate: {
      method,
      merchant: String(body.merchant ?? '').trim() || 'Compra con Apple Pay',
      amount,
      purchasedAt: new Date(),
      installments: 1,
      source: 'apple_pay',
      externalRef: null,
      raw: { card: body.card, amount: body.amount, merchant: body.merchant },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);

  const db = serviceClient();
  const settings = await settingsForRequest(db, req);
  if (!settings) return json({ error: 'Token inválido' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  if (body.source === 'ping') {
    // Apps Script reporta su estado para que la app muestre si la lectura de Gmail está funcionando.
    const patch: Record<string, unknown> = { script_seen_at: new Date().toISOString() };
    if (body.scan && typeof body.scan === 'object') patch.last_scan = body.scan;
    if (body.diagnostic && typeof body.diagnostic === 'object') patch.script_diagnostic = body.diagnostic;
    const { error } = await db.from('settings').update(patch).eq('user_id', settings.user_id);
    if (error) throw error;
    return json({ status: 'ok' });
  }
  if (!['email', 'apple_pay', 'manual'].includes(body.source)) {
    return json({ error: 'source debe ser "email", "apple_pay" o "manual"' }, 400);
  }

  // `silent`: carga de historial desde Apps Script (backfill), sin una notificación por compra.
  const silent = body.silent === true;
  let parsed: Parsed;
  try {
    parsed = toCandidate(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('ingest_errors').insert({ user_id: settings.user_id, source: body.source, error: message, payload: body });
    if (!silent) {
      await notifyUser(db, settings.user_id, {
        title: '⚠️ No pude registrar un pago',
        body: `${body.subject ?? body.merchant ?? 'Aviso sin asunto'} — revísalo en Ajustes`,
        url: '/ajustes',
        tag: 'ingest-error',
      });
    }
    // 200 para que Apps Script no reintente el mismo correo para siempre.
    return json({ status: 'error', error: message });
  }
  if (!parsed.ok) return json({ status: 'ignored', reason: parsed.reason });

  const enabled = parsed.candidate.method === 'cmr' ? settings.cmr_enabled : settings.mp_enabled;
  if (!enabled) return json({ status: 'ignored', reason: `${METHODS[parsed.candidate.method].name} está desactivado en Ajustes` });

  return json(await recordPayment(db, settings, parsed.candidate, { silent }));
});
