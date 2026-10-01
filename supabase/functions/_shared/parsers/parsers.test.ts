import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findInstallments } from './common.ts';
import { ParseError, parseEmail, type EmailInput } from './index.ts';
import { parseSharedEmail, sharedRef } from './shared.ts';

function fixture(name: string): EmailInput {
  const raw = readFileSync(new URL(`./fixtures/${name}.eml.txt`, import.meta.url), 'utf8').replace(/\r/g, '');
  const [head, ...rest] = raw.split('\n\n');
  const header = (key: string) => new RegExp(`^${key}: (.*)$`, 'm').exec(head)?.[1] ?? '';
  return {
    messageId: name,
    from: header('From'),
    subject: header('Subject'),
    date: header('Date'),
    body: rest.join('\n\n'),
  };
}

describe('CMR Falabella', () => {
  it('lee un aviso con campos etiquetados', () => {
    expect(parseEmail(fixture('cmr-compra-etiquetada'))).toEqual({
      kind: 'purchase',
      method: 'cmr',
      merchant: 'LIDER EXPRESS PROVIDENCIA',
      amount: 12990,
      purchasedAt: new Date('2026-09-21T16:45:00.000Z'),
      installments: 1,
    });
  });

  it('lee un aviso en frase con cuotas', () => {
    expect(parseEmail(fixture('cmr-compra-cuotas'))).toEqual({
      kind: 'purchase',
      method: 'cmr',
      merchant: 'FALABELLA.COM',
      amount: 359970,
      purchasedAt: new Date('2026-09-21T00:10:00.000Z'),
      installments: 6,
    });
  });

  it('ignora el pago de la tarjeta', () => {
    expect(parseEmail(fixture('cmr-pago-recibido')).kind).toBe('ignore');
  });
});

describe('Banco Falabella: transferencias', () => {
  const email = (subject: string, body: string): EmailInput => ({
    messageId: 'x',
    from: 'Banco Falabella <notificaciones@cl.bancofalabella.com>',
    subject,
    date: '2026-09-07T11:18:15.000Z',
    body,
  });

  it('registra una transferencia a otra persona, para revisar (etiquetas pegadas al valor)', () => {
    expect(parseEmail(fixture('cmr-transferencia-realizada'))).toEqual({
      kind: 'purchase',
      method: 'cmr',
      merchant: 'Transferencia a María González R',
      amount: 250000,
      purchasedAt: new Date('2026-09-28T11:50:00.000Z'),
      installments: 1,
      needsReview: true,
    });
  });

  it('ignora una transferencia a tu propia cuenta', () => {
    const own = fixture('cmr-transferencia-realizada');
    const parsed = parseEmail({ ...own, body: own.body.replace('María González R', 'Juan Pérez S') });
    expect(parsed).toEqual({ kind: 'ignore', reason: 'Transferencia a tu propia cuenta (Juan Pérez S)' });
  });

  it('sin destinatario igual registra el monto', () => {
    const parsed = parseEmail(email('Aviso de transferencia de fondos realizada', 'Monto: $15.500\nFecha: 07/09/2026'));
    expect(parsed).toMatchObject({ merchant: 'Transferencia Banco Falabella', amount: 15500 });
  });

  it.each([
    'Aviso de transferencia de fondos recibida',
    'Comprobante transferencia Avance Banco Falabella',
    'Aviso de pago de tarjeta de crédito',
    'Información sobre la evaluación de tu solicitud',
    '¡Esta noticia no te la puedes perder!',
  ])('ignora "%s"', (subject) => {
    expect(parseEmail(email(subject, 'Tu compra por $19.990 en FALABELLA.COM el 07/09/2026.')).kind).toBe('ignore');
  });
});

describe('Movimiento compartido desde la app (OCR de la imagen)', () => {
  const shared = (body: string, subject = 'Pago CMR'): EmailInput => ({
    messageId: 'x',
    from: 'Yo <yo@gmail.com>',
    subject,
    date: '2026-09-28T13:05:00.000Z',
    body,
  });
  const ocr = [
    'Detalle de la compra',
    'Comercio',
    'LIDER EXPRESS PROVIDENCIA',
    'Fecha y hora',
    '25/09/2026 14:32',
    'Cuotas',
    '3',
    'Monto',
    '$36.990',
  ].join('\n');

  it('lee el comprobante con el método del asunto', () => {
    expect(parseSharedEmail(shared(ocr))).toEqual({
      kind: 'purchase',
      method: 'cmr',
      merchant: 'LIDER EXPRESS PROVIDENCIA',
      amount: 36990,
      purchasedAt: new Date('2026-09-25T17:32:00.000Z'),
      installments: 3,
    });
  });

  it('lee el comprobante real de Banco Falabella ("Comercio Compra X" en una línea)', () => {
    expect(parseSharedEmail(fixture('cmr-compartido-ocr'))).toEqual({
      kind: 'purchase',
      method: 'cmr',
      merchant: 'Suc Cafe Ejemplo',
      amount: 10400,
      purchasedAt: new Date('2026-09-25T20:19:00.000Z'),
      installments: 1,
    });
  });

  it('un comprobante "Cuota 2 de 3" registra la compra en 3 cuotas, con su fecha original', () => {
    expect(parseSharedEmail(fixture('cmr-compartido-cuota-ocr'))).toEqual({
      kind: 'purchase',
      method: 'cmr',
      merchant: 'Oferta Perfumes',
      amount: 61552, // "Monto total" (el valor cuota $22.437 incluye intereses)
      purchasedAt: new Date('2026-08-20T19:27:00.000Z'),
      installments: 3,
    });
  });

  it.each([
    ['Cuota\n2 de 3', 3],
    ['Cuota 2 de 3', 3],
    ['Cuota: 1 de 12', 12],
    ['Cuota 2/3', 3],
    ['Cuota\n25/09/2026 17:19\nCambiar a cuotas', 1], // una fecha no es "N de M"
    ['Cuota 25/09/2026', 1],
    ['Cuota 5 de 3', 1], // la cuota no puede pasar del total
    ['Cuota 1 de 99', 1],
  ])('cuotas en %j → %i', (text, expected) => {
    expect(findInstallments(text)).toBe(expected);
  });

  it('sin etiqueta Comercio usa el título sobre el monto', () => {
    const ocr = fixture('cmr-compartido-ocr');
    const parsed = parseSharedEmail({ ...ocr, body: ocr.body.replace(/^Comercio .*\n/m, '') });
    expect(parsed).toMatchObject({ merchant: 'Suc Cafe Ejemplo', amount: 10400 });
  });

  it('el mismo pago compartido dos veces tiene el mismo id', () => {
    const a = parseSharedEmail(shared(ocr));
    const b = parseSharedEmail({ ...shared(ocr), messageId: 'y', date: '2026-09-29T10:00:00.000Z' });
    if (a.kind !== 'purchase' || b.kind !== 'purchase') throw new Error('debió leerse');
    expect(sharedRef(a)).toBe('shared:cmr:36990:2026-09-25T17:32:00.000Z');
    expect(sharedRef(b)).toBe(sharedRef(a));
  });

  it('sin fecha en la imagen falla en vez de usar la del correo', () => {
    expect(() => parseSharedEmail(shared('Comercio: LIDER\nMonto: $12.990'))).toThrow(ParseError);
  });

  it('sin texto (OCR vacío) falla', () => {
    expect(() => parseSharedEmail(shared(''))).toThrow(ParseError);
  });

  it('ignora un asunto sin método de pago', () => {
    expect(parseSharedEmail(shared(ocr, 'Pago')).kind).toBe('ignore');
  });
});

describe('Mercado Pago', () => {
  it('lee un pago con QR', () => {
    expect(parseEmail(fixture('mp-pago-qr'))).toEqual({
      kind: 'purchase',
      method: 'mercadopago',
      merchant: 'Starbucks Costanera',
      amount: 8490,
      purchasedAt: new Date('2026-09-21T12:12:00.000Z'),
      installments: 1,
    });
  });

  it('lee una compra online en cuotas', () => {
    expect(parseEmail(fixture('mp-compra-cuotas'))).toEqual({
      kind: 'purchase',
      method: 'mercadopago',
      merchant: 'SHEIN',
      amount: 45980,
      purchasedAt: new Date('2026-09-20T01:05:00.000Z'),
      installments: 3,
    });
  });

  it('ignora dinero recibido', () => {
    expect(parseEmail(fixture('mp-recibiste')).kind).toBe('ignore');
  });
});

describe('errores', () => {
  it('falla explícitamente si falta el monto', () => {
    const email: EmailInput = {
      messageId: 'x',
      from: 'notificaciones@bancofalabella.cl',
      subject: 'Notificación de compra',
      date: '2026-09-21T16:47:00.000Z',
      body: 'Se realizó una compra en LIDER con tu Tarjeta CMR.',
    };
    expect(() => parseEmail(email)).toThrow(ParseError);
  });

  it('ignora remitentes desconocidos', () => {
    expect(parseEmail({ ...fixture('mp-pago-qr'), from: 'yo@gmail.com' }).kind).toBe('ignore');
  });
});
