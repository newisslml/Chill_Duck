// Registro de un pago (solo Deno). Lo usan `ingest` (correo, Atajos) y `sync-mercadopago` (API):
// evita duplicados, categoriza, guarda y avisa por push con el total del mes.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { crossedThreshold } from './alerts.ts';
import { categorize, type MerchantRule } from './categorize.ts';
import { monthCharges, type SettingsRow } from './db.ts';
import { monthKey } from './dates.ts';
import { DEDUPE_WINDOW_MS, findDuplicate, mergePatch, type IncomingPayment, type StoredPayment } from './dedupe.ts';
import { METHODS, type Method } from './domain.ts';
import { formatCLP } from './money.ts';
import { notifyUser } from './push.ts';
import { buildReport, methodCap } from './report.ts';

export interface PaymentCandidate extends IncomingPayment {
  merchant: string;
  raw: unknown;
  /** Fuerza "revisar categoría" aunque una regla reconozca el comercio (p. ej. transferencias). */
  needsReview?: boolean;
}

export type RecordResult =
  | { status: 'created'; id: string; category: string }
  | { status: 'merged' | 'duplicate' | 'dismissed'; id?: string };

export async function loadRules(db: SupabaseClient, userId: string): Promise<MerchantRule[]> {
  const { data, error } = await db
    .from('merchant_rules')
    .select('pattern, category_id, user_id')
    .or(`user_id.is.null,user_id.eq.${userId}`);
  if (error) throw error;
  return (data ?? []) as MerchantRule[];
}

export async function recordPayment(
  db: SupabaseClient,
  settings: SettingsRow,
  c: PaymentCandidate,
  options: { silent?: boolean; rules?: MerchantRule[] } = {},
): Promise<RecordResult> {
  if (c.externalRef) {
    const { data: seen } = await db
      .from('transactions')
      .select('id')
      .eq('user_id', settings.user_id)
      .eq('external_ref', c.externalRef)
      .maybeSingle();
    if (seen) return { status: 'duplicate', id: seen.id };
    // Lo borraste en la app: no se vuelve a crear.
    const { data: dismissed } = await db
      .from('dismissed_refs')
      .select('external_ref')
      .eq('user_id', settings.user_id)
      .eq('external_ref', c.externalRef)
      .maybeSingle();
    if (dismissed) return { status: 'dismissed' };
  }

  // ¿Es el mismo pago visto por otra fuente (Apple Pay + correo, Atajo + API)?
  const { data: nearby, error: nearbyError } = await db
    .from('transactions')
    .select('id, method, amount, purchased_at, source, installments, external_ref')
    .eq('user_id', settings.user_id)
    .eq('method', c.method)
    .eq('amount', c.amount)
    .gte('purchased_at', new Date(c.purchasedAt.getTime() - DEDUPE_WINDOW_MS).toISOString())
    .lte('purchased_at', new Date(c.purchasedAt.getTime() + DEDUPE_WINDOW_MS).toISOString());
  if (nearbyError) throw nearbyError;
  const duplicate = findDuplicate(c, (nearby ?? []) as StoredPayment[]);
  if (duplicate) {
    const patch = mergePatch(duplicate, c);
    if (Object.keys(patch).length) {
      const { error } = await db.from('transactions').update(patch).eq('id', duplicate.id);
      if (error) throw error;
    }
    return { status: 'merged', id: duplicate.id };
  }

  const rules = options.rules ?? (await loadRules(db, settings.user_id));
  const { categoryId, matched } = categorize(c.merchant, rules);

  const { data: tx, error: insertError } = await db
    .from('transactions')
    .insert({
      user_id: settings.user_id,
      method: c.method,
      merchant: c.merchant,
      amount: c.amount,
      purchased_at: c.purchasedAt.toISOString(),
      installments: c.installments,
      category_id: categoryId,
      needs_review: c.needsReview || !matched,
      source: c.source,
      external_ref: c.externalRef,
      raw: c.raw,
    })
    .select('id, method, merchant, amount, installments, purchased_at')
    .single();
  if (insertError) {
    // Carrera entre dos ejecuciones con el mismo aviso: la otra ya lo registró.
    if (insertError.code === '23505') return { status: 'duplicate' };
    throw insertError;
  }

  if (!options.silent) await notifyPurchase(db, settings, tx);
  return { status: 'created', id: tx.id, category: categoryId };
}

export interface NotifiableTx {
  id: string;
  method: Method;
  merchant: string;
  amount: number;
  installments: number;
  purchased_at: string;
}

/** Push "💳 CMR · $X en Y" con el total del mes y los topes que se cruzaron. */
export async function notifyPurchase(db: SupabaseClient, settings: SettingsRow, tx: NotifiableTx) {
  const month = monthKey(new Date(tx.purchased_at));
  const report = buildReport({ month, charges: await monthCharges(db, settings.user_id, month), budget: settings });
  const thisCharge = Math.floor(tx.amount / tx.installments);
  const methodSpent = report.byMethod[tx.method].spent;
  const cap = methodCap(settings, tx.method);

  const lines = [
    report.capTotal > 0
      ? `Llevas ${formatCLP(report.spent)} de ${formatCLP(report.capTotal)} este mes (${Math.round((report.spent / report.capTotal) * 100)}%)`
      : `Llevas ${formatCLP(report.spent)} gastado este mes`,
  ];
  const general = crossedThreshold(report.spent - thisCharge, report.spent, report.capTotal);
  if (general === 1) lines.push('🚨 Superaste tu tope general');
  else if (general === 0.8) lines.push('⚠️ Pasaste el 80% de tu tope general');
  const byMethod = crossedThreshold(methodSpent - thisCharge, methodSpent, cap);
  if (byMethod === 1) lines.push(`🚨 Superaste tu tope de ${METHODS[tx.method].name}`);
  else if (byMethod === 0.8) lines.push(`⚠️ Pasaste el 80% de tu tope de ${METHODS[tx.method].name}`);

  const installments = tx.installments > 1 ? ` (${tx.installments} cuotas)` : '';
  await notifyUser(db, settings.user_id, {
    title: `💳 ${METHODS[tx.method].short} · ${formatCLP(tx.amount)} en ${tx.merchant}${installments}`,
    body: lines.join('\n'),
    url: '/movimientos',
    tag: tx.id,
  });
}
