import { describe, expect, it } from 'vitest';
import { budgetStatus, crossedThreshold } from './alerts.ts';
import { categorize, merchantPattern, type MerchantRule } from './categorize.ts';
import {
  addMonths,
  dayKey,
  formatDay,
  fromLocalInput,
  monthKey,
  monthLabel,
  monthStartInstant,
  toLocalInput,
  zonedToUtc,
} from './dates.ts';
import { findDuplicate, mergePatch, type IncomingPayment, type StoredPayment } from './dedupe.ts';
import { methodFromCardName } from './domain.ts';
import { formatCLP, parseCLP } from './money.ts';
import { buildReport, renderReportEmail, type ChargeRow } from './report.ts';

describe('money', () => {
  it.each([
    ['$12.990', 12990],
    ['$ 1.234.567', 1234567],
    ['12990', 12990],
    ['CLP 12,990', 12990],
    ['$12.990,00', 12990],
    ['12,990.00', 12990],
    ['1.990', 1990],
    ['-$5.000', 5000],
  ])('parseCLP(%s) = %i', (input, expected) => {
    expect(parseCLP(input)).toBe(expected);
  });

  it('rechaza textos sin números', () => {
    expect(() => parseCLP('gratis')).toThrow();
  });

  it('formatea en pesos chilenos', () => {
    expect(formatCLP(1234567)).toBe('$1.234.567');
  });
});

describe('dates (America/Santiago)', () => {
  it('convierte hora de Chile a UTC en invierno (-04) y verano (-03)', () => {
    expect(zonedToUtc(2026, 7, 15, 10, 0).toISOString()).toBe('2026-07-15T14:00:00.000Z');
    expect(zonedToUtc(2026, 12, 15, 10, 0).toISOString()).toBe('2026-12-15T13:00:00.000Z');
  });

  it('una compra a las 23:30 del 30/09 cuenta en septiembre aunque en UTC ya sea octubre', () => {
    const late = zonedToUtc(2026, 9, 30, 23, 30);
    expect(late.toISOString().startsWith('2026-10-01')).toBe(true);
    expect(monthKey(late)).toBe('2026-09');
    expect(dayKey(late)).toBe('2026-09-30');
  });

  it('suma meses cruzando años', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('etiquetas en español', () => {
    expect(monthLabel('2026-09')).toBe('Septiembre 2026');
    expect(formatDay('2026-09-21T16:45:00Z')).toBe('Lunes 21 de septiembre');
  });

  it('ida y vuelta con datetime-local', () => {
    expect(toLocalInput('2026-09-21T16:45:00.000Z')).toBe('2026-09-21T13:45');
    expect(fromLocalInput('2026-09-21T13:45')).toBe('2026-09-21T16:45:00.000Z');
    expect(monthStartInstant('2026-09').toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });
});

describe('categorize', () => {
  const rules: MerchantRule[] = [
    { pattern: 'LIDER', category_id: 'supermercado', user_id: null },
    { pattern: 'UBER', category_id: 'transporte', user_id: null },
    { pattern: 'UBER EATS', category_id: 'comida', user_id: null },
    { pattern: 'SPOTIFY', category_id: 'suscripciones', user_id: null },
    { pattern: 'MAX', category_id: 'suscripciones', user_id: null },
    { pattern: 'LIDER EXPRESS', category_id: 'comida', user_id: 'u1' },
  ];

  it('usa substring para patrones largos y palabra completa para cortos', () => {
    expect(categorize('MERPAGO*SPOTIFYCL', rules)).toEqual({ categoryId: 'suscripciones', matched: true });
    expect(categorize('Uber Trip', rules).categoryId).toBe('transporte');
    expect(categorize('SUPERMAXI', rules).matched).toBe(false);
  });

  it('prefiere el patrón más largo y las reglas del usuario', () => {
    expect(categorize('UBER EATS SANTIAGO', rules).categoryId).toBe('comida');
    expect(categorize('Líder Express 123', rules).categoryId).toBe('comida');
    expect(categorize('HIPER LIDER', rules).categoryId).toBe('supermercado');
  });

  it('sin coincidencias cae en "otros"', () => {
    expect(categorize('Ferretería Don Pepe', rules)).toEqual({ categoryId: 'otros', matched: false });
  });

  it('merchantPattern quita el número de sucursal', () => {
    expect(merchantPattern('Líder Express 123')).toBe('LIDER EXPRESS');
  });

  it('reconoce la tarjeta de Wallet', () => {
    expect(methodFromCardName('CMR Mastercard')).toBe('cmr');
    expect(methodFromCardName('Tarjeta Mercado Pago')).toBe('mercadopago');
    expect(methodFromCardName('Visa Banco X')).toBeNull();
  });
});

describe('dedupe', () => {
  const applePay: StoredPayment = {
    id: 'a',
    method: 'cmr',
    amount: 12990,
    purchased_at: '2026-09-21T16:45:10Z',
    source: 'apple_pay',
    installments: 1,
    external_ref: null,
  };
  const email: IncomingPayment = {
    method: 'cmr',
    amount: 12990,
    purchasedAt: new Date('2026-09-21T16:45:00Z'),
    source: 'email',
    installments: 3,
    externalRef: 'gmail:1',
  };

  it('fusiona el correo con el pago de Apple Pay y completa las cuotas', () => {
    expect(findDuplicate(email, [applePay])?.id).toBe('a');
    expect(mergePatch(applePay, email)).toEqual({ installments: 3, external_ref: 'gmail:1' });
  });

  it('no fusiona dos compras iguales de la misma fuente, ni fuera de la ventana', () => {
    expect(findDuplicate({ ...email, source: 'apple_pay', externalRef: null }, [applePay])).toBeUndefined();
    expect(findDuplicate({ ...email, purchasedAt: new Date('2026-09-21T17:30:00Z') }, [applePay])).toBeUndefined();
    expect(findDuplicate({ ...email, amount: 12991 }, [applePay])).toBeUndefined();
  });

  it('un segundo correo no se fusiona con un movimiento que ya tiene correo', () => {
    expect(findDuplicate({ ...email, externalRef: 'gmail:2' }, [{ ...applePay, external_ref: 'gmail:1' }])).toBeUndefined();
  });
});

describe('alerts', () => {
  it('estado frente al tope', () => {
    expect(budgetStatus(100, 0)).toBe('none');
    expect(budgetStatus(79, 100)).toBe('ok');
    expect(budgetStatus(80, 100)).toBe('warning');
    expect(budgetStatus(100, 100)).toBe('over');
  });

  it('avisa solo al cruzar un umbral', () => {
    expect(crossedThreshold(70, 85, 100)).toBe(0.8);
    expect(crossedThreshold(85, 90, 100)).toBeNull();
    expect(crossedThreshold(70, 120, 100)).toBe(1);
    expect(crossedThreshold(10, 20, 0)).toBeNull();
  });
});

describe('report', () => {
  const row = (over: Partial<ChargeRow>): ChargeRow => ({
    transaction_id: crypto.randomUUID(),
    method: 'cmr',
    merchant: 'LIDER',
    category_id: 'supermercado',
    needs_review: false,
    purchased_at: '2026-09-10T15:00:00Z',
    source: 'email',
    note: null,
    installments: 1,
    installment_no: 1,
    total: 10000,
    charged: 10000,
    charge_month: '2026-09-01',
    ...over,
  });
  const budget = { salary: 1_000_000, extra_income: 200_000, cap_total: 800_000, cap_cmr: 500_000, cap_mp: 300_000 };

  const report = buildReport({
    month: '2026-09',
    budget,
    charges: [
      row({ charged: 400_000, total: 400_000 }),
      row({ merchant: 'Lider', charged: 100_000, total: 100_000 }),
      row({ method: 'mercadopago', merchant: 'NETFLIX', category_id: 'suscripciones', charged: 150_000 }),
    ],
    prevCharges: [row({ charged: 500_000 })],
    nextCharges: [
      row({ installments: 3, installment_no: 2, charged: 40_000 }),
      row({ method: 'mercadopago', installments: 1, installment_no: 1, charged: 999 }),
    ],
  });

  it('calcula gasto, ahorro y estado contra el sueldo y el tope', () => {
    expect(report.income).toBe(1_200_000);
    expect(report.spent).toBe(650_000);
    expect(report.saved).toBe(550_000);
    expect(report.savedAtCap).toBe(400_000);
    expect(report.remainingToCap).toBe(150_000);
    expect(report.status).toBe('warning');
  });

  it('agrupa por método, categoría y comercio', () => {
    expect(report.byMethod.cmr).toMatchObject({ spent: 500_000, status: 'over', count: 2 });
    expect(report.byMethod.mercadopago).toMatchObject({ spent: 150_000, status: 'ok' });
    expect(report.byCategory.map((c) => [c.id, c.amount])).toEqual([
      ['supermercado', 500_000],
      ['suscripciones', 150_000],
    ]);
    expect(report.topMerchants[0]).toEqual({ merchant: 'LIDER', amount: 500_000, count: 2 });
  });

  it('solo cuenta como comprometidas las cuotas de compras anteriores', () => {
    expect(report.nextCommitted).toEqual({ cmr: 40_000, mercadopago: 0, total: 40_000 });
    expect(report.prevSpent).toBe(500_000);
  });

  it('arma el correo', () => {
    const email = renderReportEmail(report);
    expect(email.subject).toContain('Septiembre 2026');
    expect(email.html).toContain('$650.000');
    expect(email.html).toContain('Cuotas comprometidas');
    expect(email.text).toContain('Ahorro del mes: $550.000');
  });
});
