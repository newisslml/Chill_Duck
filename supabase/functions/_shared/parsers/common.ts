// Utilidades para leer avisos de compra en texto plano (Gmail `getPlainBody()`).
// Los bancos cambian el formato sin avisar: cada extractor prueba varias formas
// ("Monto: $X", "compra por $X", ...) y el parser falla explícitamente si no encuentra lo esencial.

import { zonedToUtc } from '../dates.ts';
import { parseCLP } from '../money.ts';

export interface EmailInput {
  messageId: string;
  from: string;
  subject: string;
  /** Fecha del correo en ISO (fallback si el cuerpo no trae fecha/hora). */
  date: string;
  body: string;
}

export interface ParsedPurchase {
  kind: 'purchase';
  merchant: string;
  amount: number;
  purchasedAt: Date;
  installments: number;
}

export interface Ignored {
  kind: 'ignore';
  reason: string;
}

export type ParseResult = ParsedPurchase | Ignored;

export class ParseError extends Error {
  override name = 'ParseError';
}

export const ignore = (reason: string): Ignored => ({ kind: 'ignore', reason });

export function cleanText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "$12.990", "$ 1.234.567", "$990", "CLP 12.990,00" */
export const AMOUNT_RE = String.raw`(?:(?:\$|CLP)\s?\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|(?:\$|CLP)\s?\d+(?:,\d{1,2})?)`;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Valor de un campo "Etiqueta: valor" (o con el valor en la línea siguiente). */
export function labeled(text: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    const l = escapeRegExp(label);
    const sameLine = new RegExp(`^${l}\\s*:\\s*(\\S.*)$`, 'im').exec(text);
    if (sameLine) return sameLine[1].trim();
    const nextLine = new RegExp(`^${l}\\s*:?\\s*\\n+\\s*(\\S.*)$`, 'im').exec(text);
    if (nextLine) return nextLine[1].trim();
  }
  return null;
}

function amountIn(value: string | null): number | null {
  if (!value) return null;
  const m = new RegExp(AMOUNT_RE, 'i').exec(value) ?? /\d{1,3}(?:\.\d{3})+|\d+/.exec(value);
  if (!m) return null;
  const n = parseCLP(m[0]);
  return n > 0 ? n : null;
}

const AMOUNT_LABELS = [
  'Monto de la compra',
  'Monto total',
  'Monto pagado',
  'Monto',
  'Total pagado',
  'Total',
  'Valor',
  'Importe',
];

/** Monto de la compra: primero campos etiquetados, luego frases, luego el primer "$" del texto. */
export function findAmount(text: string, sentencePatterns: readonly RegExp[] = []): number | null {
  const fromLabel = amountIn(labeled(text, AMOUNT_LABELS));
  if (fromLabel) return fromLabel;
  for (const re of sentencePatterns) {
    const m = re.exec(text);
    const n = amountIn(m?.[1] ?? null);
    if (n) return n;
  }
  return amountIn(new RegExp(AMOUNT_RE, 'i').exec(text)?.[0] ?? null);
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function findTime(text: string): [number, number] | null {
  const label = labeled(text, ['Hora', 'Hora de la compra', 'Hora de la transacción']);
  const m = /(\d{1,2}):(\d{2})/.exec(label ?? '') ?? /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:hrs?\.?|horas|hs)?\b/i.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
}

/**
 * Fecha y hora de la compra en hora de Chile. Entiende "21/09/2026 13:45",
 * "21-09-26", "21 de septiembre de 2026 a las 09:12". Sin fecha en el cuerpo, usa la del correo.
 */
export function findDate(text: string, fallbackIso: string): Date {
  const fallback = new Date(fallbackIso);
  let y: number | undefined;
  let mo: number | undefined;
  let d: number | undefined;
  let time: [number, number] | null = null;

  const numeric = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b(?:[^\d\n]{1,12}?(\d{1,2}):(\d{2}))?/.exec(text);
  const long = /\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+|del\s+)?(\d{4})(?:[^\d\n]{1,12}?(\d{1,2}):(\d{2}))?/i.exec(text);

  if (numeric) {
    d = Number(numeric[1]);
    mo = Number(numeric[2]);
    y = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    if (numeric[4]) time = [Number(numeric[4]), Number(numeric[5])];
  } else if (long && MONTHS[long[2].toLowerCase()]) {
    d = Number(long[1]);
    mo = MONTHS[long[2].toLowerCase()];
    y = Number(long[3]);
    if (long[4]) time = [Number(long[4]), Number(long[5])];
  }

  if (!y || !mo || !d || mo > 12 || d > 31) return fallback;
  time ??= findTime(text);
  if (!time) {
    // Sin hora en el cuerpo: si el correo llegó ese mismo día, su hora es la mejor aproximación.
    const noon = zonedToUtc(y, mo, d, 12);
    return Math.abs(noon.getTime() - fallback.getTime()) <= 12 * 3_600_000 ? fallback : noon;
  }
  const parsed = zonedToUtc(y, mo, d, time[0], time[1]);
  // Una fecha absurda (más de 45 días de distancia con el correo) es casi seguro otra fecha del texto.
  return Math.abs(parsed.getTime() - fallback.getTime()) > 45 * 86_400_000 ? fallback : parsed;
}

export function findInstallments(text: string): number {
  const label = labeled(text, ['N° de cuotas', 'Nº de cuotas', 'Número de cuotas', 'Nro. de cuotas', 'Cuotas']);
  const m = /\d{1,2}/.exec(label ?? '') ?? /\ben\s+(\d{1,2})\s+cuotas\b/i.exec(text) ?? /\b(\d{1,2})\s+cuotas\b/i.exec(text);
  const n = m ? Number(m[1] ?? m[0]) : 1;
  return Number.isInteger(n) && n >= 1 && n <= 48 ? n : 1;
}

const NOT_A_MERCHANT = /^(?:\d+\s*cuotas?|(?:tu|su|el|la|los|las|nuestr[oa]s?|l[ií]nea)\b|www\.|\**\s*\d+$)/i;

export function cleanMerchant(value: string): string | null {
  const m = value
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!]+$/, '')
    .trim()
    .slice(0, 80);
  if (m.length < 2 || NOT_A_MERCHANT.test(m)) return null;
  return m;
}

const MERCHANT_LABELS = [
  'Nombre del comercio',
  'Comercio',
  'Establecimiento',
  'Local',
  'Lugar',
  'Tienda',
  'Vendedor',
];

/**
 * Nombre del comercio: campos etiquetados, luego las frases propias de cada banco
 * y por último el patrón genérico "... en COMERCIO por/el/con ...".
 */
export function findMerchant(
  text: string,
  sentencePatterns: readonly RegExp[] = [],
  extraLabels: readonly string[] = [],
): string | null {
  const fromLabel = labeled(text, [...extraLabels, ...MERCHANT_LABELS]);
  const cleanLabel = fromLabel ? cleanMerchant(fromLabel) : null;
  if (cleanLabel) return cleanLabel;

  for (const re of sentencePatterns) {
    const m = re.exec(text);
    const merchant = m ? cleanMerchant(m[1]) : null;
    if (merchant) return merchant;
  }

  const generic = new RegExp(
    String.raw`\ben\s+(.+?)(?=\s+el\s+\d|\s+por\s+(?:un\s+(?:monto|total)\s+de\s+)?(?:\$|CLP)|\s+con\s+(?:tu|su)\b|\s+a\s+las\b|\s+en\s+\d+\s+cuotas|[,;]|\.\s|\.$|\n|$)`,
    'gim',
  );
  for (const m of text.matchAll(generic)) {
    const merchant = cleanMerchant(m[1]);
    if (merchant) return merchant;
  }
  return null;
}

/** Arma el resultado o falla indicando qué faltó. */
export function purchaseOrThrow(
  merchant: string | null,
  amount: number | null,
  purchasedAt: Date,
  installments: number,
): ParsedPurchase {
  const missing = [!merchant && 'comercio', !amount && 'monto'].filter(Boolean);
  if (missing.length) throw new ParseError(`No encontré ${missing.join(' ni ')} en el correo`);
  return { kind: 'purchase', merchant: merchant!, amount: amount!, purchasedAt, installments };
}
