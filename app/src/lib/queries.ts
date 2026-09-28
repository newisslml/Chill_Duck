import type { MerchantRule } from '@shared/categorize.ts';
import { addMonths, monthStart, monthStartInstant } from '@shared/dates.ts';
import type { Method } from '@shared/domain.ts';
import type { Budget, ChargeRow, MonthReport } from '@shared/report.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { playCashSound } from './sound';
import { supabase } from './supabase';

export interface Settings extends Budget {
  user_id: string;
  report_email: string | null;
  apps_script_url: string | null;
  ingest_token: string;
  /** Cómo te queremos llamar (saludo de Inicio, onboarding). */
  alias: string | null;
  /** Se marca al terminar el onboarding; mientras sea null, la app lo vuelve a mostrar. */
  onboarded_at: string | null;
  cmr_enabled: boolean;
  mp_enabled: boolean;
  /** Último contacto del script de Gmail (Apps Script). */
  script_seen_at?: string | null;
  /** Última lectura de correos del script (transferencias y "Pago CMR" de Banco Falabella). */
  last_scan?: { at: string; errors: string[] } | null;
  /** Última sincronización con la API de Mercado Pago. */
  mp_sync?: { at: string; created: number; errors: string[] } | null;
}

export interface TransactionInput {
  id?: string;
  method: Method;
  merchant: string;
  amount: number;
  purchased_at: string;
  installments: number;
  category_id: string;
  note: string | null;
}

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
}

export interface IngestError {
  id: number;
  source: string;
  error: string;
  payload: { subject?: string; merchant?: string; from?: string };
  created_at: string;
}

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as T;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const existing = await unwrap(supabase.from('settings').select('*').maybeSingle());
      if (existing) return existing as Settings;
      // Primer inicio de sesión: crea la fila con valores en cero y un token nuevo.
      return (await unwrap(supabase.from('settings').insert({}).select('*').single())) as Settings;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, ...patch }: Partial<Settings> & { user_id: string }) =>
      unwrap(
        supabase
          .from('settings')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('user_id', user_id)
          .select('*')
          .single(),
      ),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}

/** Lo que cada compra carga al mes (una fila por cuota que cae en el mes). */
export function useCharges(month: string) {
  return useQuery({
    queryKey: ['charges', month],
    queryFn: async () =>
      (await unwrap(
        supabase
          .from('month_charges')
          .select('*')
          .eq('charge_month', monthStart(month))
          .order('purchased_at', { ascending: false }),
      )) as ChargeRow[],
  });
}

/** Cuotas de compras hechas hasta `month` que caen en los meses siguientes. */
export function useCommittedCharges(month: string) {
  return useQuery({
    queryKey: ['committed', month],
    queryFn: async () =>
      (await unwrap(
        supabase
          .from('month_charges')
          .select('*')
          .gt('charge_month', monthStart(month))
          .lt('purchased_at', monthStartInstant(addMonths(month, 1)).toISOString())
          .order('charge_month'),
      )) as ChargeRow[],
  });
}

/** Foto guardada al cerrar el mes (null si aún no se genera). */
export function useSavedReport(month: string) {
  return useQuery({
    queryKey: ['report', month],
    queryFn: async () => {
      const row = await unwrap(
        supabase.from('monthly_reports').select('data').eq('month', monthStart(month)).maybeSingle(),
      );
      return (row as { data: MonthReport } | null)?.data ?? null;
    },
  });
}

export function useMerchantRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: async () =>
      (await unwrap(supabase.from('merchant_rules').select('pattern, category_id, user_id'))) as MerchantRule[],
    staleTime: 10 * 60_000,
  });
}

function invalidateMovements(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['charges'] }),
    qc.invalidateQueries({ queryKey: ['committed'] }),
  ]);
}

export function useSaveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: TransactionInput) => {
      const row = { ...fields, needs_review: false };
      if (id) return unwrap(supabase.from('transactions').update(row).eq('id', id));
      const created = await unwrap<{ id: string }>(
        supabase.from('transactions').insert({ ...row, source: 'manual' }).select('id').single(),
      );
      // El gasto ya quedó guardado: si el aviso falla, no se muestra como error del formulario.
      void supabase.functions
        .invoke('notify-purchase', { body: { id: created.id } })
        .then(({ error }) => error && console.error('No se pudo enviar el aviso del gasto:', error));
      return created;
    },
    onSuccess: () => invalidateMovements(qc),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await unwrap(
        supabase
          .from('notifications')
          .select('id, title, body, url, created_at, read_at')
          .order('created_at', { ascending: false })
          .limit(200),
      )) as AppNotification[],
  });
}

export function useUnreadNotifications(): number {
  const notifications = useNotifications();
  return (notifications.data ?? []).filter((n) => !n.read_at).length;
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  return useMutation({
    // RLS limita el borrado a tus notificaciones; el filtro solo evita un DELETE sin WHERE.
    mutationFn: async () => unwrap(supabase.from('notifications').delete().gt('id', 0)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(supabase.from('transactions').delete().eq('id', id)),
    onSuccess: () => invalidateMovements(qc),
  });
}

export function useAddMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: { user_id: string; pattern: string; category_id: string }) =>
      unwrap(supabase.from('merchant_rules').upsert(rule, { onConflict: 'user_id,pattern' })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useIngestErrors() {
  return useQuery({
    queryKey: ['ingest-errors'],
    queryFn: async () =>
      (await unwrap(
        supabase.from('ingest_errors').select('*').order('created_at', { ascending: false }).limit(20),
      )) as IngestError[],
  });
}

export function useDismissIngestError() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => unwrap(supabase.from('ingest_errors').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingest-errors'] }),
  });
}

/** Fuentes que vienen de un Atajo de iOS (a diferencia de la sincronización automática de la API). */
const SHORTCUT_SOURCES = new Set(['apple_pay', 'manual']);

/** Refresca la app apenas llega un pago nuevo (Realtime de Supabase); si vino de un Atajo, suena el pato. */
export function useRealtimeSync(userId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('transactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          void invalidateMovements(qc);
          const source = (payload.new as { source?: string } | null)?.source;
          if (payload.eventType === 'INSERT' && source && SHORTCUT_SOURCES.has(source)) playCashSound();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [qc, userId]);
}
