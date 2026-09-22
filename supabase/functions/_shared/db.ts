// Utilidades de servidor (solo Deno / Edge Functions).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ChargeRow } from './report.ts';
import { monthStart } from './dates.ts';

export interface SettingsRow {
  user_id: string;
  salary: number;
  extra_income: number;
  cap_total: number;
  cap_cmr: number;
  cap_mp: number;
  cmr_enabled: boolean;
  mp_enabled: boolean;
  report_email: string | null;
  ingest_token: string;
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Identifica al dueño por su token secreto (cabecera `x-ingest-token` o `?token=`).
 * Así Apps Script y el Atajo de iOS no necesitan iniciar sesión.
 */
export async function settingsForRequest(db: SupabaseClient, req: Request): Promise<SettingsRow | null> {
  const token = req.headers.get('x-ingest-token') ?? new URL(req.url).searchParams.get('token');
  if (!token || token.length < 32) return null;
  const { data, error } = await db.from('settings').select('*').eq('ingest_token', token).maybeSingle();
  if (error) throw error;
  return data as SettingsRow | null;
}

export async function monthCharges(db: SupabaseClient, userId: string, month: string): Promise<ChargeRow[]> {
  const { data, error } = await db
    .from('month_charges')
    .select('*')
    .eq('user_id', userId)
    .eq('charge_month', monthStart(month));
  if (error) throw error;
  return (data ?? []) as ChargeRow[];
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
