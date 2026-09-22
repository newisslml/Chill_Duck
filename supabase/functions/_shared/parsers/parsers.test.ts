import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParseError, parseEmail, type EmailInput } from './index.ts';

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
