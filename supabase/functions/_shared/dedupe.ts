import type { Method, Source } from './domain.ts';

/** Un pago con Apple Pay también genera correo: ambos avisos llegan dentro de esta ventana. */
export const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export interface IncomingPayment {
  method: Method;
  amount: number;
  purchasedAt: Date;
  source: Source;
  installments: number;
  externalRef: string | null;
}

export interface StoredPayment {
  id: string;
  method: Method;
  amount: number;
  purchased_at: string;
  source: Source;
  installments: number;
  external_ref: string | null;
}

/**
 * Busca un movimiento ya registrado que sea el mismo pago visto por otra fuente:
 * mismo método y monto, dentro de la ventana, y de una fuente distinta.
 * Dos compras iguales seguidas (dos cafés) llegan por la misma fuente y no se fusionan.
 */
export function findDuplicate(
  incoming: IncomingPayment,
  existing: readonly StoredPayment[],
): StoredPayment | undefined {
  const at = incoming.purchasedAt.getTime();
  return existing
    .filter(
      (e) =>
        e.method === incoming.method &&
        e.amount === incoming.amount &&
        e.source !== incoming.source &&
        // Un correo no puede fusionarse con un movimiento que ya tiene su propio correo.
        !(incoming.externalRef && e.external_ref) &&
        Math.abs(Date.parse(e.purchased_at) - at) <= DEDUPE_WINDOW_MS,
    )
    .sort(
      (a, b) => Math.abs(Date.parse(a.purchased_at) - at) - Math.abs(Date.parse(b.purchased_at) - at),
    )[0];
}

/** Datos que el aviso nuevo aporta al movimiento existente (p. ej. las cuotas que trae el correo). */
export function mergePatch(
  existing: StoredPayment,
  incoming: IncomingPayment,
): Partial<Pick<StoredPayment, 'installments' | 'external_ref'>> {
  const patch: Partial<Pick<StoredPayment, 'installments' | 'external_ref'>> = {};
  if (incoming.installments > 1 && existing.installments === 1) patch.installments = incoming.installments;
  if (incoming.externalRef && !existing.external_ref) patch.external_ref = incoming.externalRef;
  return patch;
}
