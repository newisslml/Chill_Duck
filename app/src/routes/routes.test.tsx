// Prueba de humo: cada vista se renderiza con datos de ejemplo sin romperse
// y muestra los números calculados. Supabase y React Query se reemplazan por datos fijos.

import type { ChargeRow } from '@shared/report.ts';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const row = (over: Partial<ChargeRow>): ChargeRow => ({
  transaction_id: crypto.randomUUID(),
  method: 'cmr',
  merchant: 'LIDER EXPRESS',
  category_id: 'supermercado',
  needs_review: false,
  purchased_at: '2026-09-21T16:45:00Z',
  source: 'email',
  note: null,
  installments: 1,
  installment_no: 1,
  total: 45_990,
  charged: 45_990,
  charge_month: '2026-09-01',
  ...over,
});

const demo = {
  settings: {
    user_id: 'u1',
    salary: 1_200_000,
    extra_income: 100_000,
    cap_total: 900_000,
    cap_cmr: 600_000,
    cap_mp: 300_000,
    cmr_enabled: true,
    mp_enabled: true,
    alias: 'Newiss',
    onboarded_at: '2026-09-01T12:00:00Z',
    report_email: null,
    apps_script_url: null,
    ingest_token: 'a'.repeat(64),
  },
  charges: [
    row({}),
    row({ merchant: 'NETFLIX.COM', category_id: 'suscripciones', method: 'mercadopago', total: 10_990, charged: 10_990, purchased_at: '2026-09-20T12:00:00Z' }),
    row({ merchant: 'FALABELLA.COM', category_id: 'ropa', total: 359_970, charged: 59_995, installments: 6, purchased_at: '2026-09-20T00:10:00Z' }),
    row({ merchant: 'Starbucks Costanera', category_id: 'comida', method: 'mercadopago', total: 8_490, charged: 8_490, purchased_at: '2026-09-19T12:12:00Z' }),
    row({ merchant: 'Ferretería Don Pepe', category_id: 'otros', needs_review: true, total: 23_500, charged: 23_500, purchased_at: '2026-09-18T20:00:00Z' }),
    row({ merchant: 'COPEC', category_id: 'transporte', total: 40_000, charged: 40_000, purchased_at: '2026-09-15T13:00:00Z' }),
    row({ merchant: 'SHEIN', category_id: 'ropa', method: 'mercadopago', total: 45_980, charged: 15_327, installments: 3, installment_no: 2, purchased_at: '2026-08-19T01:05:00Z' }),
    row({ merchant: 'ENEL', category_id: 'hogar', method: 'mercadopago', total: 38_700, charged: 38_700, purchased_at: '2026-09-05T15:00:00Z' }),
    row({ merchant: 'CINEMARK', category_id: 'entretenimiento', method: 'mercadopago', total: 17_800, charged: 17_800, purchased_at: '2026-09-06T23:00:00Z' }),
    row({ merchant: 'JUMBO', total: 128_450, charged: 128_450, purchased_at: '2026-09-02T18:30:00Z' }),
    row({ merchant: 'Cuota crédito', category_id: 'deudas', method: 'mercadopago', total: 150_000, charged: 150_000, purchased_at: '2026-09-01T12:00:00Z' }),
  ],
  committed: [
    row({ merchant: 'FALABELLA.COM', total: 359_970, charged: 59_995, installments: 6, installment_no: 2, charge_month: '2026-10-01' }),
    row({ merchant: 'FALABELLA.COM', total: 359_970, charged: 59_995, installments: 6, installment_no: 3, charge_month: '2026-11-01' }),
    row({ merchant: 'SHEIN', method: 'mercadopago', total: 45_980, charged: 15_326, installments: 3, installment_no: 3, charge_month: '2026-10-01' }),
  ],
  notifications: [
    { id: 2, title: '💳 CMR · $12.990 en Ferretería Don Pepe', body: 'Llevas $539.242 de $900.000 este mes (60%)', url: '/movimientos', created_at: '2026-09-21T12:10:00Z', read_at: null },
    { id: 1, title: '🦆 Tu informe de agosto está listo', body: 'Gastaste $610.000 y ahorraste $690.000', url: null, created_at: '2026-09-01T11:00:00Z', read_at: '2026-09-01T12:00:00Z' },
  ],
};

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
  functionsUrl: 'https://demo.supabase.co/functions/v1',
  isConfigured: true,
}));

vi.mock('../lib/queries', () => {
  const query = (data: unknown) => ({ data, isLoading: false, error: null });
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null });
  return {
    useSettings: () => query(demo.settings),
    useCharges: (month: string) => query(month === '2026-09' ? demo.charges : []),
    useCommittedCharges: () => query(demo.committed),
    useSavedReport: () => query(null),
    useMerchantRules: () => query([]),
    useIngestErrors: () =>
      query([{ id: 1, source: 'email', error: 'No encontré monto en el correo', payload: { subject: 'Compra con tu Tarjeta CMR' }, created_at: '2026-09-21T10:00:00Z' }]),
    useSaveSettings: mutation,
    useSaveTransaction: mutation,
    useDeleteTransaction: mutation,
    useAddMerchantRule: mutation,
    useDismissIngestError: mutation,
    useRealtimeSync: () => undefined,
    useNotifications: () => query(demo.notifications),
    useUnreadNotifications: () => demo.notifications.filter((n) => !n.read_at).length,
    useMarkNotificationsRead: mutation,
    useClearNotifications: mutation,
  };
});

async function render(path: string) {
  const { MonthProvider } = await import('../lib/month');
  const { Inicio } = await import('./Inicio');
  const { MetodosPago } = await import('./MetodosPago');
  const { Movimientos } = await import('./Movimientos');
  const { Ajustes } = await import('./Ajustes');
  const { Notificaciones } = await import('./Notificaciones');
  const page = {
    '/': <Inicio />,
    '/metodos': <MetodosPago />,
    '/movimientos': <Movimientos userId="u1" />,
    '/ajustes': <Ajustes email="yo@example.org" />,
    '/notificaciones': <Notificaciones />,
  }[path];
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <MonthProvider>{page}</MonthProvider>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  vi.stubGlobal('window', { location: { search: '?mes=2026-09' }, matchMedia: () => ({ matches: false }) });
});

describe('vistas', () => {
  it('Inicio compara el gasto con los ingresos y el tope', async () => {
    const html = await render('/');
    expect(html).toContain('$539.242'); // gastado
    expect(html).toContain('41%'); // de $1.300.000
    expect(html).toContain('25 ago – 24 sep'); // período del mes de facturación
    expect(html).toContain('Supermercado');
    expect(html).toContain('$760.758'); // ahorro a la fecha
    expect(html).toContain('Hi, <!-- -->Newiss');
    expect(html).toContain('Notificaciones, 1 sin leer');
  });

  it('Notificaciones muestra el historial por día y destaca las no leídas', async () => {
    const html = await render('/notificaciones');
    expect(html).toContain('Lunes 21 de septiembre');
    expect(html).toContain('💳 CMR · $12.990 en Ferretería Don Pepe');
    expect(html).toContain('Tu informe de agosto está listo');
    expect(html.match(/\(nueva\)/g)).toHaveLength(1);
  });

  it('Métodos separa CMR y Mercado Pago con sus topes y cuotas', async () => {
    const html = await render('/metodos');
    expect(html).toContain('CMR Falabella');
    expect(html).toContain('Mercado Pago');
    expect(html).toContain('$297.935'); // CMR
    expect(html).toContain('Cuotas comprometidas');
  });

  it('Movimientos agrupa por día y muestra cuotas', async () => {
    const html = await render('/movimientos');
    expect(html).toContain('Lunes 21 de septiembre');
    expect(html).toContain('Cuota <!-- -->2<!-- -->/<!-- -->3');
    expect(html).toContain('Revisar categoría');
  });

  it('Ajustes muestra sueldo, topes y avisos no leídos', async () => {
    const html = await render('/ajustes');
    expect(html).toContain('1.200.000');
    expect(html).toContain('Avisos que no pude leer');
    expect(html).toContain('https://demo.supabase.co/functions/v1/ingest');
  });
});
