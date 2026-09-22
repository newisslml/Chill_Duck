// Avisos de pagos hechos con Mercado Pago (dinero en cuenta, tarjeta Mercado Pago, QR, transferencias).
// Solo se registra dinero que sale; lo que entra (cobros, transferencias recibidas) se ignora.

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

const INCOMING =
  /(recibiste|te (transfiri[oó]|envi[oó]|pag[oó])|ingres[oó] (dinero|plata)|cobraste|vendiste|devoluci[oó]n|reembolso|reintegro|rendimiento|rindieron|cobro aprobado)/i;

const IGNORE_SUBJECT = /(c[oó]digo|clave|inicio de sesi[oó]n|ingresaste|promoci|oferta|descuento|cup[oó]n|encuesta|resumen de tu cuenta)/i;

const OUTGOING =
  /(pagaste|tu pago|pago aprobado|pago realizado|hiciste un pago|compraste|tu compra|compra aprobada|transferiste|enviaste)/i;

const STOP = String.raw`(?=\s+(?:fue|est[aá]|se|con|a\s+las)\b|\s+el\s+\d|\s+por\s+(?:\$|CLP)|\s+en\s+\d+\s+cuotas|[,;!]|\.\s|\.$|\n|$)`;

export function parseMercadoPagoEmail(email: EmailInput): ParseResult {
  const subject = cleanText(email.subject);
  const body = cleanText(email.body);
  const head = `${subject}\n${body.slice(0, 400)}`;
  if (IGNORE_SUBJECT.test(subject)) return ignore(`Asunto no es un pago: "${subject}"`);
  if (INCOMING.test(head)) return ignore('Dinero recibido, no es un gasto');
  if (!OUTGOING.test(head)) return ignore('El correo no menciona un pago');

  const amount = findAmount(body, [
    new RegExp(String.raw`(?:pagaste|transferiste|enviaste|compraste|pago de)\s+(${AMOUNT_RE})`, 'i'),
  ]) ?? findAmount(subject);

  const text = `${subject}\n${body}`;
  const merchant = findMerchant(
    text,
    [
      new RegExp(String.raw`tu (?:pago|compra) (?:a|en)\s+(.+?)${STOP}`, 'i'),
      new RegExp(String.raw`(?:pagaste|transferiste|enviaste)\s+(?:${AMOUNT_RE}\s+)?(?:a|en)\s+(.+?)${STOP}`, 'i'),
      new RegExp(String.raw`compraste\s+(?:en|a)\s+(.+?)${STOP}`, 'i'),
    ],
    ['Pagaste a', 'Le pagaste a', 'Destinatario', 'Para'],
  );

  return purchaseOrThrow(merchant, amount, findDate(body, email.date), findInstallments(body));
}
