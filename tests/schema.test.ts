// Aplica la migración en un Postgres embebido (PGlite) con lo mínimo de Supabase
// simulado (esquema auth, roles y publicación de Realtime) y prueba cuotas, meses y RLS.

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth, public to authenticated, service_role;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  insert into auth.users values ('${USER_A}'), ('${USER_B}');
`;

let db: PGlite;

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
});

describe('migración', () => {
  it('reparte una compra en cuotas: $120.000 en 3 → $40.000 por mes', async () => {
    await asUser(USER_A, () =>
      db.query(
        `insert into transactions (method, merchant, amount, installments, purchased_at)
         values ('cmr', 'FALABELLA.COM', 120000, 3, '2026-09-10 12:00-03')`,
      ),
    );
    const { rows } = await asUser(USER_A, () =>
      db.query<{ charge_month: Date; charged: number; installment_no: number }>(
        `select charge_month, charged::int, installment_no from month_charges
         where merchant = 'FALABELLA.COM' order by charge_month`,
      ),
    );
    expect(rows.map((r) => [r.charge_month.toISOString().slice(0, 7), r.charged, r.installment_no])).toEqual([
      ['2026-09', 40000, 1],
      ['2026-10', 40000, 2],
      ['2026-11', 40000, 3],
    ]);
  });

  it('la última cuota absorbe el resto', async () => {
    await asUser(USER_A, () =>
      db.query(
        `insert into transactions (method, merchant, amount, installments, purchased_at)
         values ('mercadopago', 'SHEIN', 100000, 3, '2026-09-11 12:00-03')`,
      ),
    );
    const { rows } = await asUser(USER_A, () =>
      db.query<{ charged: number }>(
        `select charged::int from month_charges where merchant = 'SHEIN' order by installment_no`,
      ),
    );
    expect(rows.map((r) => r.charged)).toEqual([33333, 33333, 33334]);
  });

  it('el mes se cuenta en hora de Chile', async () => {
    await asUser(USER_A, () =>
      db.query(
        `insert into transactions (method, merchant, amount, purchased_at)
         values ('cmr', 'NOCHE', 5000, '2026-10-01 02:30+00')`,
      ),
    );
    const { rows } = await asUser(USER_A, () =>
      db.query<{ charge_month: Date }>(`select charge_month from month_charges where merchant = 'NOCHE'`),
    );
    expect(rows[0].charge_month.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('cada usuario ve solo sus movimientos', async () => {
    const { rows } = await asUser(USER_B, () => db.query(`select * from month_charges`));
    expect(rows).toHaveLength(0);
    await expect(
      asUser(USER_B, () =>
        db.query(`insert into transactions (user_id, method, merchant, amount) values ('${USER_A}', 'cmr', 'X', 1)`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('crea ajustes con un token de 64 caracteres', async () => {
    const { rows } = await asUser(USER_A, () =>
      db.query<{ ingest_token: string }>(`insert into settings default values returning ingest_token`),
    );
    expect(rows[0].ingest_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('las reglas base son visibles y las propias se pueden reemplazar', async () => {
    const insertRule = () =>
      db.query(
        `insert into merchant_rules (pattern, category_id) values ('DON PEPE', 'hogar')
         on conflict (user_id, pattern) do update set category_id = excluded.category_id`,
      );
    await asUser(USER_A, insertRule);
    await asUser(USER_A, insertRule);
    const { rows } = await asUser(USER_A, () =>
      db.query<{ n: number; own: number }>(
        `select count(*)::int as n, count(user_id)::int as own from merchant_rules`,
      ),
    );
    expect(rows[0].own).toBe(1);
    expect(rows[0].n).toBeGreaterThan(80);
  });

  it('recuerda los pagos externos que borraste para no volver a crearlos', async () => {
    await asUser(USER_A, () =>
      db.query(
        `insert into transactions (method, merchant, amount, source, external_ref)
         values ('mercadopago', 'TRANSFERENCIA', 10000, 'api', 'mp:123')`,
      ),
    );
    await asUser(USER_A, () => db.query(`delete from transactions where external_ref = 'mp:123'`));
    const { rows } = await asUser(USER_A, () =>
      db.query<{ external_ref: string }>(`select external_ref from dismissed_refs`),
    );
    expect(rows.map((r) => r.external_ref)).toEqual(['mp:123']);
  });

  it('no registra dos veces el mismo correo', async () => {
    const insert = () =>
      db.query(
        `insert into transactions (method, merchant, amount, source, external_ref)
         values ('cmr', 'LIDER', 1000, 'email', 'gmail:abc')`,
      );
    await asUser(USER_A, insert);
    await expect(asUser(USER_A, insert)).rejects.toThrow(/duplicate key/);
  });
});
