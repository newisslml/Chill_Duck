// Reemplazo en memoria de `lib/queries.ts` para el modo demo. Misma API, sin Supabase:
// los cambios (editar, agregar, borrar) viven hasta recargar la página.

import type { MerchantRule } from '@shared/categorize.ts';
import { addMonths, monthStart, monthStartInstant } from '@shared/dates.ts';
import { METHODS } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification, IngestError, Settings, TransactionInput } from '../lib/queries';
import { demoTransactions, expandCharges } from './data';

export type { AppNotification, IngestError, Settings, TransactionInput } from '../lib/queries';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const store = {
  settings: {
    user_id: 'demo',
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
    ingest_token: 'demo'.repeat(16),
  } as Settings,
  transactions: demoTransactions(),
  rules: [
    ['LIDER', 'supermercado'],
    ['JUMBO', 'supermercado'],
    ['UNIMARC', 'supermercado'],
    ['NETFLIX', 'suscripciones'],
    ['SPOTIFY', 'suscripciones'],
    ['STARBUCKS', 'comida'],
    ['RAPPI', 'comida'],
    ['UBER', 'transporte'],
    ['COPEC', 'transporte'],
    ['CRUZ VERDE', 'salud'],
    ['ENEL', 'hogar'],
    ['CINEMARK', 'entretenimiento'],
  ].map(([pattern, category_id]) => ({ pattern, category_id, user_id: null })) as MerchantRule[],
  errors: [
    {
      id: 1,
      source: 'email',
      error: 'No encontré monto en el correo',
      payload: { subject: 'Compra con tu Tarjeta CMR' },
      created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    },
  ] as IngestError[],
  notifications: [
    {
      id: 3,
      title: '💳 CMR · $45.990 en LIDER EXPRESS',
      body: 'Llevas $539.242 de $900.000 este mes (60%)',
      url: '/movimientos',
      created_at: hoursAgo(1),
      read_at: null,
    },
    {
      id: 2,
      title: '⚠️ No pude registrar un pago',
      body: 'Compra con tu Tarjeta CMR — revísalo en Ajustes',
      url: '/ajustes',
      created_at: hoursAgo(3),
      read_at: null,
    },
    {
      id: 1,
      title: '💳 Mercado Pago · $8.490 en Starbucks Costanera',
      body: 'Llevas $493.252 de $900.000 este mes (55%)',
      url: '/movimientos',
      created_at: hoursAgo(30),
      read_at: hoursAgo(29),
    },
  ] as AppNotification[],
};

/** Pequeña espera para que se vea como una app real. */
const later = <T,>(value: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(value()), 120));

const charges = () => expandCharges(store.transactions);

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => later(() => ({ ...store.settings })) });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ user_id: _, ...patch }: Partial<Settings> & { user_id: string }) =>
      later(() => Object.assign(store.settings, patch) && { ...store.settings }),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}

export function useCharges(month: string) {
  return useQuery({
    queryKey: ['charges', month],
    queryFn: () =>
      later(() =>
        charges()
          .filter((c) => c.charge_month === monthStart(month))
          .sort((a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at)),
      ),
  });
}

export function useCommittedCharges(month: string) {
  const until = monthStartInstant(addMonths(month, 1)).getTime();
  return useQuery({
    queryKey: ['committed', month],
    queryFn: () =>
      later(() =>
        charges()
          .filter((c) => c.charge_month > monthStart(month) && Date.parse(c.purchased_at) < until)
          .sort((a, b) => a.charge_month.localeCompare(b.charge_month)),
      ),
  });
}

export function useSavedReport(month: string) {
  return useQuery({ queryKey: ['report', month], queryFn: () => later(() => null) });
}

export function useMerchantRules() {
  return useQuery({ queryKey: ['rules'], queryFn: () => later(() => [...store.rules]) });
}

function useInvalidateMovements() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['charges'] }),
      qc.invalidateQueries({ queryKey: ['committed'] }),
    ]);
}

export function useSaveTransaction() {
  const invalidate = useInvalidateMovements();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: TransactionInput) =>
      later(() => {
        const existing = store.transactions.find((t) => t.id === id);
        if (existing) return void Object.assign(existing, fields, { needs_review: false });
        store.transactions.push({ ...fields, id: crypto.randomUUID(), needs_review: false, source: 'manual' });
        // Simula el aviso que en producción envía la función `notify-purchase`.
        store.notifications.unshift({
          id: Math.max(0, ...store.notifications.map((n) => n.id)) + 1,
          title: `💳 ${METHODS[fields.method].short} · ${formatCLP(fields.amount)} en ${fields.merchant}`,
          body: 'Gasto ingresado a mano',
          url: '/movimientos',
          created_at: new Date().toISOString(),
          read_at: null,
        });
      }),
    onSuccess: () => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['notifications'] })]),
  });
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => later(() => store.notifications.map((n) => ({ ...n }))) });
}

export function useUnreadNotifications(): number {
  const notifications = useNotifications();
  return (notifications.data ?? []).filter((n) => !n.read_at).length;
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      later(() => {
        const now = new Date().toISOString();
        for (const n of store.notifications) n.read_at ??= now;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => later(() => void (store.notifications = [])),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMovements();
  return useMutation({
    mutationFn: (id: string) => later(() => void (store.transactions = store.transactions.filter((t) => t.id !== id))),
    onSuccess: invalidate,
  });
}

export function useAddMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rule: { user_id: string; pattern: string; category_id: string }) =>
      later(() => void store.rules.push(rule)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useIngestErrors() {
  return useQuery({ queryKey: ['ingest-errors'], queryFn: () => later(() => [...store.errors]) });
}

export function useDismissIngestError() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => later(() => void (store.errors = store.errors.filter((e) => e.id !== id))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingest-errors'] }),
  });
}

export function useRealtimeSync(_userId: string) {}
