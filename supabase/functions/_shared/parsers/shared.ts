// Movimientos que te envías a tu propio correo desde la app del banco (Compartir → Gmail) con el
// asunto "Pago CMR". Llegan como imagen: Apps Script la pasa por el OCR de Google Drive y manda
// el texto, que no siempre respeta "Etiqueta: valor".

import { methodFromCardName, type Method } from '../domain.ts';
import {
  cleanMerchant,
  cleanText,
  findAmount,
  findDate,
  findInstallments,
  ignore,
  labeled,
  ParseError,
  purchaseOrThrow,
  type EmailInput,
  type Ignored,
  type ParsedPurchase,
} from './common.ts';

export function parseSharedEmail(email: EmailInput): (ParsedPurchase & { method: Method }) | Ignored {
  const method = methodFromCardName(email.subject);
  if (!method) return ignore(`El asunto no dice el método de pago: "${email.subject}"`);
  const body = cleanText(email.body);
  if (!body) throw new ParseError('No encontré texto en la imagen del correo');

  // Sin fecha en la imagen, findDate devuelve la del correo, que es cuando lo compartiste: no sirve.
  const purchasedAt = findDate(body, email.date);
  if (purchasedAt.getTime() === Date.parse(email.date)) throw new ParseError('No encontré la fecha en la imagen');

  const purchase = purchaseOrThrow(merchantOf(body), findAmount(body), purchasedAt, findInstallments(body));
  return { ...purchase, method };
}

const MERCHANT_LABELS = ['Comercio', 'Descripción', 'Glosa'];

/**
 * Comprobante de Banco Falabella: "Comercio Compra Suc X" (etiqueta y valor en la misma línea,
 * sin ":"). Si falta, el título que va justo sobre el monto ("Compra Suc X" / "$10.400").
 */
function merchantOf(body: string): string | null {
  let value = labeled(body, MERCHANT_LABELS);
  for (const label of MERCHANT_LABELS) value ??= new RegExp(`^${label}\\s+(\\S.*)$`, 'im').exec(body)?.[1] ?? null;
  if (!value) {
    const lines = body.split('\n');
    const amountLine = lines.findIndex((l) => /^\$\s?\d/.test(l));
    if (amountLine > 0 && !/^banco\b/i.test(lines[amountLine - 1])) value = lines[amountLine - 1];
  }
  // El banco antepone el tipo de movimiento: "Compra Suc Camila" → "Suc Camila".
  return value ? cleanMerchant(value.replace(/^compra\s+(?:en\s+)?/i, '')) : null;
}

/**
 * Id del movimiento según su contenido, no según el correo: si compartes dos veces el mismo
 * pago, el segundo queda como duplicado (y si lo borraste en la app, no vuelve).
 */
export function sharedRef(p: ParsedPurchase & { method: Method }): string {
  return `shared:${p.method}:${p.amount}:${p.purchasedAt.toISOString()}`;
}
