// Pagos hechos con tu cuenta de Mercado Pago, leídos desde la API con tu Access Token.
// `/v1/payments/search?payer.id=<tu id>` devuelve lo que pagaste (QR, tarjeta, Mercado Crédito,
// transferencias) junto con cargas de saldo, que no son gasto.

import type { Source } from './domain.ts';

/** Campos de la API que usamos (la respuesta trae muchos más). */
export interface MpPayment {
  id: number;
  status: string;
  operation_type: string;
  payment_type_id?: string;
  payment_method_id?: string;
  description?: string | null;
  statement_descriptor?: string | null;
  transaction_amount: number;
  installments?: number | null;
  currency_id?: string;
  date_created: string;
  date_approved?: string | null;
  collector_id?: number | null;
  payer?: { id?: number | string | null } | null;
}

export interface MpCandidate {
  method: 'mercadopago';
  merchant: string;
  amount: number;
  purchasedAt: Date;
  installments: number;
  source: Source;
  externalRef: string;
  needsReview: boolean;
  raw: Record<string, unknown>;
}

export type MpDecision =
  | { kind: 'record'; candidate: MpCandidate }
  | { kind: 'remove'; externalRef: string; reason: string }
  | { kind: 'skip'; reason: string };

/**
 * Operaciones que no son gasto: cargas de saldo, cambios de moneda, inversiones y
 * `partition_transfer` (mover plata a una reserva o meta de ahorro dentro de tu cuenta).
 */
const NOT_SPENDING = new Set([
  'account_fund',
  'money_exchange',
  'investment',
  'recurring_investment',
  'partition_transfer',
]);

/** Estados en que el pago se deshizo: si ya estaba registrado, se borra. */
const UNDONE = new Set(['refunded', 'cancelled', 'charged_back', 'rejected']);

export const mpExternalRef = (id: number | string) => `mp:${id}`;

/**
 * Limpia el nombre que llega de la API: los cobros con QR o POS traen prefijos del procesador
 * ("Mercadopago *littleca", "Tuu* immv spa").
 */
export function mpMerchant(p: Pick<MpPayment, 'description' | 'statement_descriptor' | 'operation_type'>): string {
  const raw = (p.description ?? '').trim() || (p.statement_descriptor ?? '').trim();
  const cleaned = raw.replace(/^(mercado\s*pago|mercadopago|mp|tuu|sumup|getnet|flow|klap)\s*\*\s*/i, '').trim();
  if (cleaned) return cleaned.slice(0, 80);
  return p.operation_type === 'money_transfer' ? 'Transferencia Mercado Pago' : 'Pago con Mercado Pago';
}

export function classifyPayment(p: MpPayment, myUserId: number): MpDecision {
  if (p.collector_id === myUserId) return { kind: 'skip', reason: 'Dinero recibido' };
  if (NOT_SPENDING.has(p.operation_type)) return { kind: 'skip', reason: `No es gasto (${p.operation_type})` };
  if (UNDONE.has(p.status)) return { kind: 'remove', externalRef: mpExternalRef(p.id), reason: p.status };
  if (p.status !== 'approved') return { kind: 'skip', reason: `Aún no aprobado (${p.status})` };
  const amount = Math.round(p.transaction_amount);
  if (!(amount > 0)) return { kind: 'skip', reason: 'Monto en cero' };

  return {
    kind: 'record',
    candidate: {
      method: 'mercadopago',
      merchant: mpMerchant(p),
      amount,
      // La fecha de creación es cuando pagaste; la aprobación puede llegar días después.
      purchasedAt: new Date(p.date_created),
      installments: Math.min(48, Math.max(1, p.installments ?? 1)),
      source: 'api',
      externalRef: mpExternalRef(p.id),
      // Una transferencia puede ser un pago o plata que te mueves a ti mismo: mejor revisarla.
      needsReview: p.operation_type === 'money_transfer',
      raw: {
        id: p.id,
        operation_type: p.operation_type,
        payment_type_id: p.payment_type_id,
        payment_method_id: p.payment_method_id,
        description: p.description,
        date_created: p.date_created,
        date_approved: p.date_approved,
      },
    },
  };
}
