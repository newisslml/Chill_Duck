// Datos de ejemplo del modo demo (`npm run demo`). Las fechas se arman en el mes de facturación actual
// (del 25 al 24) para que la app se vea "viva" cualquier día que la abras.

import { addMonths, BILLING_CLOSING_DAY, monthKey, monthStart, zonedToUtc } from '@shared/dates.ts';
import { firstChargeDelay, type Method, type Source } from '@shared/domain.ts';
import type { ChargeRow } from '@shared/report.ts';

export interface DemoTransaction {
  id: string;
  method: Method;
  merchant: string;
  amount: number;
  purchased_at: string;
  installments: number;
  category_id: string;
  needs_review: boolean;
  note: string | null;
  source: Source;
}

export function demoTransactions(now = new Date()): DemoTransaction[] {
  const month = monthKey(now);
  const prev = addMonths(month, -1);
  // `day` es el día dentro del mes de facturación: 1 = el día 25 del mes anterior. Date.UTC normaliza
  // días de más (25 + 20 = 15 del mes siguiente).
  const at = (m: string, day: number, hour: number, minute: number) => {
    const [y, mo] = m.split('-').map(Number);
    return zonedToUtc(y, mo - 1, BILLING_CLOSING_DAY + day, hour, minute).toISOString();
  };
  const tx = (
    merchant: string,
    category_id: string,
    method: Method,
    amount: number,
    purchased_at: string,
    extra: Partial<DemoTransaction> = {},
  ): DemoTransaction => ({
    id: crypto.randomUUID(),
    merchant,
    category_id,
    method,
    amount,
    purchased_at,
    installments: 1,
    needs_review: false,
    note: null,
    source: 'email',
    ...extra,
  });

  return [
    tx('LIDER EXPRESS', 'supermercado', 'cmr', 45_990, at(month, 21, 13, 45), { source: 'apple_pay' }),
    tx('NETFLIX.COM', 'suscripciones', 'mercadopago', 10_990, at(month, 20, 9, 0)),
    tx('FALABELLA.COM', 'ropa', 'cmr', 359_970, at(month, 19, 21, 10), { installments: 6 }),
    tx('Starbucks Costanera', 'comida', 'mercadopago', 8_490, at(month, 19, 9, 12), { source: 'apple_pay' }),
    tx('Ferretería Don Pepe', 'otros', 'cmr', 23_500, at(month, 18, 17, 0), { needs_review: true }),
    tx('COPEC', 'transporte', 'cmr', 40_000, at(month, 15, 10, 0), { source: 'apple_pay' }),
    tx('ENEL', 'hogar', 'mercadopago', 38_700, at(month, 5, 11, 0)),
    tx('CINEMARK', 'entretenimiento', 'mercadopago', 17_800, at(month, 6, 20, 0)),
    tx('JUMBO', 'supermercado', 'cmr', 128_450, at(month, 2, 14, 30)),
    tx('Cuota crédito', 'deudas', 'mercadopago', 150_000, at(month, 1, 8, 0), { source: 'manual', note: 'Crédito de consumo' }),
    // Mes de facturación anterior: para comparar, para la cuota 2/3 de SHEIN y la 1/3 de RIPLEY (CMR cobra
    // la primera cuota un mes después) que caen este mes.
    tx('SHEIN', 'ropa', 'mercadopago', 45_980, at(prev, 18, 22, 5), { installments: 3 }),
    tx('RIPLEY', 'ropa', 'cmr', 119_970, at(prev, 10, 19, 30), { installments: 3 }),
    tx('JUMBO', 'supermercado', 'cmr', 142_300, at(prev, 3, 12, 0)),
    tx('Cuota crédito', 'deudas', 'mercadopago', 150_000, at(prev, 1, 8, 0), { source: 'manual' }),
    tx('UBER', 'transporte', 'cmr', 12_400, at(prev, 12, 23, 40)),
    tx('RAPPI', 'comida', 'mercadopago', 21_900, at(prev, 22, 21, 15)),
    tx('PARIS', 'ropa', 'cmr', 64_990, at(prev, 25, 18, 20)),
  ].filter((t) => Date.parse(t.purchased_at) <= now.getTime());
}

/** Misma regla que la vista SQL `month_charges`: una fila por cuota, la última absorbe el resto. */
export function expandCharges(transactions: readonly DemoTransaction[]): ChargeRow[] {
  return transactions.flatMap((t) => {
    const first = monthKey(new Date(t.purchased_at));
    const base = Math.floor(t.amount / t.installments);
    return Array.from({ length: t.installments }, (_, i) => ({
      transaction_id: t.id,
      method: t.method,
      merchant: t.merchant,
      category_id: t.category_id,
      needs_review: t.needs_review,
      purchased_at: t.purchased_at,
      source: t.source,
      note: t.note,
      installments: t.installments,
      installment_no: i + 1,
      total: t.amount,
      charged: i === t.installments - 1 ? t.amount - base * (t.installments - 1) : base,
      charge_month: monthStart(addMonths(first, i + firstChargeDelay(t.method, t.installments))),
    }));
  });
}
