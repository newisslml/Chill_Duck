// Aplica la migración en un Postgres embebido (PGlite) con lo mínimo de Supabase
// simulado (esquema auth, roles y publicación de Realtime) y prueba cuotas, meses y RLS.

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { BILLING_CLOSING_DAY, monthKey, monthStart } from '../supabase/functions/_shared/dates.ts';

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

  it('el mes es el de facturación: el día de cierre cuenta, el siguiente ya es del mes que viene', async () => {
    const closing = BILLING_CLOSING_DAY;
    const cases = [
      // [comercio, instante, charge_month esperado]
      ['CIERRE', `2026-10-${closing} 23:30-03`, '2026-10-01'], // 23:30 del 24 en Chile (ya es 25 en UTC)
      ['APERTURA', `2026-10-${closing + 1} 00:10-03`, '2026-11-01'], // 00:10 del 25
      ['FIN DE MES', '2026-09-30 12:00-03', '2026-10-01'],
      ['INICIO DE MES', '2026-10-01 12:00-03', '2026-10-01'],
      ['FIN DE AÑO', '2026-12-26 12:00-03', '2027-01-01'],
    ];
    for (const [merchant, at] of cases) {
      await asUser(USER_A, () =>
        db.query(`insert into transactions (method, merchant, amount, purchased_at) values ('cmr', $1, 5000, $2)`, [
          merchant,
          at,
        ]),
      );
    }
    const { rows } = await asUser(USER_A, () =>
      db.query<{ merchant: string; charge_month: Date }>(
        `select merchant, charge_month from month_charges where merchant = any($1)`,
        [cases.map(([merchant]) => merchant)],
      ),
    );
    const got = Object.fromEntries(rows.map((r) => [r.merchant, r.charge_month.toISOString().slice(0, 10)]));
    expect(got).toEqual(Object.fromEntries(cases.map(([merchant, , month]) => [merchant, month])));
    // El mismo corte que usa la app (TypeScript): si uno cambia el día y el otro no, esto falla.
    for (const [, at, month] of cases) {
      expect(monthStart(monthKey(new Date(at)))).toBe(month);
    }
  });

  it('las cuotas parten en el mes de facturación de la compra', async () => {
    await asUser(USER_A, () =>
      db.query(
        `insert into transactions (method, merchant, amount, installments, purchased_at)
         values ('mercadopago', 'CUOTAS TARDE', 90000, 3, '2026-09-28 12:00-03')`,
      ),
    );
    const { rows } = await asUser(USER_A, () =>
      db.query<{ charge_month: Date; installment_no: number }>(
        `select charge_month, installment_no from month_charges where merchant = 'CUOTAS TARDE' order by installment_no`,
      ),
    );
    expect(rows.map((r) => [r.charge_month.toISOString().slice(0, 7), r.installment_no])).toEqual([
      ['2026-10', 1],
      ['2026-11', 2],
      ['2026-12', 3],
    ]);
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

  it('el historial de notificaciones es privado y la app solo puede marcarlas como leídas', async () => {
    await db.exec(`set role service_role;`);
    await db.query(
      `insert into notifications (user_id, title, body) values ('${USER_A}', '💳 CMR · $1.990 en OXXO', 'Llevas $1.990')`,
    );
    await db.exec(`reset role;`);

    const { rows: others } = await asUser(USER_B, () => db.query(`select * from notifications`));
    expect(others).toHaveLength(0);

    await asUser(USER_A, () => db.query(`update notifications set read_at = now()`));
    const { rows } = await asUser(USER_A, () =>
      db.query<{ read: boolean }>(`select read_at is not null as read from notifications`),
    );
    expect(rows).toEqual([{ read: true }]);

    await expect(asUser(USER_A, () => db.query(`update notifications set title = 'otro'`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(USER_A, () => db.query(`insert into notifications (user_id, title) values ('${USER_A}', 'falsa')`)),
    ).rejects.toThrow(/permission denied/);
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
