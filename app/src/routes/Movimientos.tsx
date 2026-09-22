import { normalizeMerchant } from '@shared/categorize.ts';
import { dayKey, formatDay } from '@shared/dates.ts';
import { categoryById, CATEGORIES, METHOD_IDS, METHODS, type Method } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import type { ChargeRow } from '@shared/report.ts';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MonthPicker } from '../components/MonthPicker';
import { TransactionRow } from '../components/TransactionRow';
import { TransactionSheet } from '../components/TransactionSheet';
import { Card, ErrorNote, Field, inputClass, methodColor, MoneyInput, PageHeader, Spinner } from '../components/ui';
import { useMonth } from '../lib/month';
import { useCharges, useDeleteTransaction } from '../lib/queries';

type MethodFilter = 'all' | Method;
type Sort = 'date' | 'amount-desc' | 'amount-asc';

export function Movimientos({ userId }: { userId: string }) {
  const { month } = useMonth();
  const charges = useCharges(month);
  const [params, setParams] = useSearchParams();
  const category = params.get('cat');

  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(0);
  const [sort, setSort] = useState<Sort>('date');
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<ChargeRow | 'new' | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const deleteTransaction = useDeleteTransaction();

  const rows = useMemo(() => {
    const q = normalizeMerchant(query);
    const filtered = (charges.data ?? []).filter(
      (r) =>
        (!q || normalizeMerchant(`${r.merchant} ${r.note ?? ''}`).includes(q)) &&
        (method === 'all' || r.method === method) &&
        (!category || r.category_id === category) &&
        (!min || r.charged >= min) &&
        (!max || r.charged <= max),
    );
    if (sort === 'amount-desc') return filtered.sort((a, b) => b.charged - a.charged);
    if (sort === 'amount-asc') return filtered.sort((a, b) => a.charged - b.charged);
    return filtered.sort((a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at));
  }, [charges.data, query, method, category, min, max, sort]);

  const groups = useMemo(() => {
    if (sort !== 'date') return [{ key: 'all', label: null as string | null, rows }];
    const byDay = new Map<string, ChargeRow[]>();
    for (const r of rows) byDay.set(dayKey(r.purchased_at), [...(byDay.get(dayKey(r.purchased_at)) ?? []), r]);
    return [...byDay.entries()].map(([key, dayRows]) => ({ key, label: formatDay(dayRows[0].purchased_at), rows: dayRows }));
  }, [rows, sort]);

  const total = rows.reduce((acc, r) => acc + r.charged, 0);
  const extraFilters = Number(Boolean(min)) + Number(Boolean(max)) + Number(sort !== 'date');

  function clearCategory() {
    params.delete('cat');
    setParams(params, { replace: true });
  }

  return (
    <>
      <PageHeader title="Movimientos" />
      <div className="mb-3 flex justify-center">
        <MonthPicker />
      </div>

      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-page/95 px-4 pt-[env(safe-area-inset-top)] pb-3 backdrop-blur">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <span className="sr-only">Buscar por nombre</span>
            <input
              type="search"
              className={`${inputClass} pl-10`}
              placeholder="Buscar comercio o nota"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className={`relative rounded-xl border px-3 ${showFilters ? 'border-accent text-accent' : 'border-hairline text-ink-2'} bg-raised`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-label="Más filtros"
          >
            <SlidersHorizontal size={20} />
            {extraFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">
                {extraFilters}
              </span>
            )}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Método de pago">
          {(['all', ...METHOD_IDS] as MethodFilter[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                method === m ? 'border-ink bg-ink text-page' : 'border-hairline bg-raised text-ink-2'
              }`}
            >
              {m !== 'all' && <span className="size-2 rounded-full" style={{ background: methodColor(m) }} aria-hidden />}
              {m === 'all' ? 'Todos' : METHODS[m].name}
            </button>
          ))}
          {category && (
            <button
              onClick={clearCategory}
              className="flex shrink-0 items-center gap-1 rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm text-ink"
            >
              {categoryById(category).name} <X size={14} aria-label="Quitar filtro de categoría" />
            </button>
          )}
        </div>

        {showFilters && (
          <Card className="space-y-3 bg-raised">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto desde">
                <MoneyInput value={min} onChange={setMin} />
              </Field>
              <Field label="Monto hasta">
                <MoneyInput value={max} onChange={setMax} placeholder="Sin límite" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <select
                  className={inputClass}
                  value={category ?? ''}
                  onChange={(e) => {
                    if (e.target.value) params.set('cat', e.target.value);
                    else params.delete('cat');
                    setParams(params, { replace: true });
                  }}
                >
                  <option value="">Todas</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ordenar por">
                <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="date">Más recientes</option>
                  <option value="amount-desc">Mayor monto</option>
                  <option value="amount-asc">Menor monto</option>
                </select>
              </Field>
            </div>
            {extraFilters > 0 && (
              <button
                className="text-sm font-medium text-accent"
                onClick={() => {
                  setMin(0);
                  setMax(0);
                  setSort('date');
                }}
              >
                Limpiar filtros
              </button>
            )}
          </Card>
        )}
      </div>

      {charges.error ? (
        <ErrorNote error={charges.error} />
      ) : charges.isLoading ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-2">
            {rows.length} {rows.length === 1 ? 'movimiento' : 'movimientos'} ·{' '}
            <span className="tabular font-semibold text-ink">{formatCLP(total)}</span>
          </p>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              {charges.data?.length ? 'Ningún movimiento coincide con los filtros.' : 'Aún no hay movimientos este mes.'}
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const dayTotal = g.rows.reduce((acc, r) => acc + r.charged, 0);
                return (
                  <section key={g.key}>
                    {g.label && (
                      <h2 className="mb-1 flex justify-between px-1 text-xs font-semibold tracking-wide text-muted uppercase">
                        <span>{g.label}</span>
                        <span className="tabular">{formatCLP(dayTotal)}</span>
                      </h2>
                    )}
                    <Card className="divide-y divide-hairline overflow-hidden px-3 py-0">
                      {g.rows.map((r) => {
                        const id = `${r.transaction_id}-${r.installment_no}`;
                        return (
                          <TransactionRow
                            key={id}
                            row={r}
                            onClick={() => {
                              setOpenRowId(null);
                              setEditing(r);
                            }}
                            onDelete={() => deleteTransaction.mutate(r.transaction_id)}
                            isOpen={openRowId === id}
                            onOpenChange={(open) => setOpenRowId(open ? id : null)}
                          />
                        );
                      })}
                    </Card>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <button
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg active:scale-95"
        onClick={() => {
          setOpenRowId(null);
          setEditing('new');
        }}
        aria-label="Agregar gasto manual"
      >
        <Plus size={26} />
      </button>

      {editing && (
        <TransactionSheet
          row={editing === 'new' ? undefined : editing}
          userId={userId}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
