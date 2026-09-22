import { describe, expect, it } from 'vitest';
import { classifyPayment, mpMerchant, type MpPayment } from './mercadopago.ts';

const ME = 146869293;

// Formas reales devueltas por /v1/payments/search (valores anonimizados).
const payment = (over: Partial<MpPayment>): MpPayment => ({
  id: 178876066799,
  status: 'approved',
  operation_type: 'regular_payment',
  payment_type_id: 'account_money',
  payment_method_id: 'account_money',
  description: 'Copec zervo',
  transaction_amount: 6000,
  installments: 1,
  currency_id: 'CLP',
  date_created: '2026-09-19T12:06:17.000-04:00',
  date_approved: '2026-09-19T12:06:18.000-04:00',
  collector_id: 111,
  payer: { id: ME },
  ...over,
});

describe('Mercado Pago', () => {
  it('registra un pago con QR como gasto de Mercado Pago', () => {
    const d = classifyPayment(payment({}), ME);
    expect(d.kind).toBe('record');
    if (d.kind !== 'record') return;
    expect(d.candidate).toMatchObject({
      method: 'mercadopago',
      merchant: 'Copec zervo',
      amount: 6000,
      installments: 1,
      source: 'api',
      externalRef: 'mp:178876066799',
      needsReview: false,
    });
    expect(d.candidate.purchasedAt.toISOString()).toBe('2026-09-19T16:06:17.000Z');
  });

  it('usa la fecha del pago aunque la aprobación llegue días después', () => {
    const d = classifyPayment(payment({ date_created: '2026-09-20T11:34:30.000-04:00', date_approved: '2026-09-21T19:16:15.000-04:00' }), ME);
    expect(d.kind === 'record' && d.candidate.purchasedAt.toISOString()).toBe('2026-09-20T15:34:30.000Z');
  });

  it('registra Mercado Crédito con sus cuotas', () => {
    const d = classifyPayment(
      payment({ payment_type_id: 'digital_currency', payment_method_id: 'consumer_credits', description: 'bip!QR', transaction_amount: 1740, installments: 3 }),
      ME,
    );
    expect(d.kind === 'record' && d.candidate.installments).toBe(3);
  });

  it('no cuenta cargas de saldo, reservas de ahorro ni dinero recibido', () => {
    expect(classifyPayment(payment({ operation_type: 'account_fund', payment_type_id: 'bank_transfer' }), ME).kind).toBe('skip');
    expect(classifyPayment(payment({ operation_type: 'partition_transfer', description: null, transaction_amount: 200000 }), ME).kind).toBe('skip');
    expect(classifyPayment(payment({ operation_type: 'money_transfer', description: 'Beneficio Mercado Pago', collector_id: ME }), ME).kind).toBe('skip');
  });

  it('borra pagos reembolsados y espera los pendientes', () => {
    expect(classifyPayment(payment({ status: 'refunded' }), ME)).toEqual({ kind: 'remove', externalRef: 'mp:178876066799', reason: 'refunded' });
    expect(classifyPayment(payment({ status: 'in_process' }), ME).kind).toBe('skip');
  });

  it('marca las transferencias enviadas para revisar', () => {
    const d = classifyPayment(payment({ operation_type: 'money_transfer', description: null, transaction_amount: 10000 }), ME);
    expect(d.kind === 'record' && d.candidate).toMatchObject({ merchant: 'Transferencia Mercado Pago', needsReview: true });
  });

  it('limpia los prefijos del procesador', () => {
    expect(mpMerchant({ description: 'Mercadopago *littleca', operation_type: 'regular_payment' })).toBe('littleca');
    expect(mpMerchant({ description: 'Tuu* immv spa', operation_type: 'regular_payment' })).toBe('immv spa');
    expect(mpMerchant({ description: '  ', statement_descriptor: 'JUMBO', operation_type: 'regular_payment' })).toBe('JUMBO');
  });
});
