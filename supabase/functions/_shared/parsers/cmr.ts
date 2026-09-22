// Avisos de compra de Banco Falabella / Tarjeta CMR.
// Ajusta los patrones con correos reales en `fixtures/` si el banco cambia el formato.

import {
  AMOUNT_RE,
  cleanText,
  findAmount,
  findDate,
  findInstallments,
  findMerchant,
  ignore,
  purchaseOrThrow,
  type EmailInput,
  type ParseResult,
} from './common.ts';

/** Asuntos que no son compras. Solo se mira el asunto: los pies de correo mencionan de todo. */
const IGNORE_SUBJECT =
  /(estado de cuenta|pago recibido|recibimos tu pago|hemos recibido (el|tu) pago|pago de tu tarjeta|anulaci[oó]n|reversa|devoluci[oó]n|clave|c[oó]digo|promoci|oferta|beneficio|cyber|black friday|seguro|encuesta)/i;

const PURCHASE = /(compra|transacci[oó]n|cargo|uso de tu tarjeta)/i;

export function parseCmrEmail(email: EmailInput): ParseResult {
  const subject = cleanText(email.subject);
  const body = cleanText(email.body);
  if (IGNORE_SUBJECT.test(subject)) return ignore(`Asunto no es una compra: "${subject}"`);
  if (!PURCHASE.test(`${subject}\n${body.slice(0, 600)}`)) return ignore('El correo no menciona una compra');

  const amount = findAmount(body, [
    new RegExp(String.raw`(?:compra|cargo|transacci[oó]n)[^\n$]{0,40}?(?:por|de)\s+(?:un\s+(?:monto|total)\s+de\s+)?(${AMOUNT_RE})`, 'i'),
  ]);
  const merchant = findMerchant(body, [
    /(?:compra|cargo|transacci[oó]n)[^\n]{0,60}?\ben\s+(.+?)(?=\s+el\s+\d|\s+por\s+(?:\$|CLP)|\s+con\s+tu\b|\s+a\s+las\b|\s+en\s+\d+\s+cuotas|[,;]|\.\s|\.$|\n|$)/i,
  ]);

  return purchaseOrThrow(merchant, amount, findDate(body, email.date), findInstallments(body));
}
