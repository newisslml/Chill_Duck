// Avisos de Banco Falabella / Tarjeta CMR.
// Ajusta los patrones con correos reales en `fixtures/` si el banco cambia el formato.
//
// En la práctica Banco Falabella no avisa por correo las compras con la CMR, pero sí las
// transferencias que haces desde tu cuenta ("Aviso de transferencia de fondos realizada").

import { normalizeMerchant } from '../categorize.ts';
import {
  AMOUNT_RE,
  cleanMerchant,
  cleanText,
  findAmount,
  findDate,
  findInstallments,
  findMerchant,
  ignore,
  labeled,
  purchaseOrThrow,
  type EmailInput,
  type ParseResult,
} from './common.ts';

/** Asuntos que no son compras. Solo se mira el asunto: los pies de correo mencionan de todo. */
const IGNORE_SUBJECT =
  /(estado de cuenta|pago recibido|recibimos tu pago|hemos recibido (el|tu) pago|pago de (tu )?tarjeta|anulaci[oó]n|reversa|devoluci[oó]n|clave|c[oó]digo|promoci|oferta|beneficio|cyber|black friday|seguro|encuesta|solicitud)/i;

/** Solo el asunto: el mismo remitente envía publicidad que habla de "compras" en el cuerpo. */
const PURCHASE_SUBJECT = /(compra|transacci[oó]n|cargo|uso de (tu )?tarjeta)/i;
/** Plata que sale de tu cuenta. Las transferencias recibidas y los avances en efectivo no calzan. */
const TRANSFER_SUBJECT = /transferencia\b.*\brealizada/i;

/**
 * El texto plano del aviso pega etiqueta y valor ("DetalleNombre destinatarioJuan Pérez",
 * "Monto transferencia$4.500", "Fecha28-09-2026", "Hora08:50"): se separan con ": ".
 */
const GLUED_LABELS = ['Nombre destinatario', 'Monto transferencia', 'Fecha', 'Hora'];

function unglue(body: string): string {
  return body
    .replace(/^Detalle(?=\S)/gm, 'Detalle\n')
    .replace(new RegExp(`^(${GLUED_LABELS.join('|')})(?=[^\\s:])`, 'gim'), '$1: ');
}

/** El saludo trae tu nombre ("SEBASTIAN, tu transferencia está lista"): si el destinatario eres tú, no es gasto. */
function isToYourself(body: string, recipient: string): boolean {
  const greeting = /^([^\s,]+),\s+tu transferencia/im.exec(body)?.[1];
  return Boolean(greeting) && normalizeMerchant(recipient.split(' ')[0]) === normalizeMerchant(greeting!);
}

function parseTransfer(email: EmailInput, rawBody: string): ParseResult {
  const body = unglue(rawBody);
  const fromLabel = labeled(body, ['Nombre destinatario', 'Nombre del destinatario', 'Destinatario']);
  const recipient = fromLabel ? cleanMerchant(fromLabel) : null;
  // Plata que te mueves a otra cuenta tuya (p. ej. a Mercado Pago): ya se cuenta cuando la gastas allá.
  if (recipient && isToYourself(body, recipient)) return ignore(`Transferencia a tu propia cuenta (${recipient})`);

  const amount = findAmount(body, [], ['Monto transferencia', 'Monto transferido']);
  // Sin destinatario igual se registra: lo importante es el monto.
  const merchant = recipient ? `Transferencia a ${recipient}` : 'Transferencia Banco Falabella';
  return { ...purchaseOrThrow(merchant, amount, findDate(body, email.date), 1), needsReview: true };
}

export function parseCmrEmail(email: EmailInput): ParseResult {
  const subject = cleanText(email.subject);
  const body = cleanText(email.body);
  if (IGNORE_SUBJECT.test(subject)) return ignore(`Asunto no es una compra: "${subject}"`);
  if (TRANSFER_SUBJECT.test(subject)) return parseTransfer(email, body);
  if (!PURCHASE_SUBJECT.test(subject)) return ignore(`Asunto no es una compra: "${subject}"`);

  const amount = findAmount(body, [
    new RegExp(String.raw`(?:compra|cargo|transacci[oó]n)[^\n$]{0,40}?(?:por|de)\s+(?:un\s+(?:monto|total)\s+de\s+)?(${AMOUNT_RE})`, 'i'),
  ]);
  const merchant = findMerchant(body, [
    /(?:compra|cargo|transacci[oó]n)[^\n]{0,60}?\ben\s+(.+?)(?=\s+el\s+\d|\s+por\s+(?:\$|CLP)|\s+con\s+tu\b|\s+a\s+las\b|\s+en\s+\d+\s+cuotas|[,;]|\.\s|\.$|\n|$)/i,
  ]);

  return purchaseOrThrow(merchant, amount, findDate(body, email.date), findInstallments(body));
}
