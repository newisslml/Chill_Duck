import { categorize, merchantPattern } from '@shared/categorize.ts';
import { fromLocalInput, toLocalInput } from '@shared/dates.ts';
import { CATEGORIES, METHOD_IDS, METHODS, type Method } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import type { ChargeRow } from '@shared/report.ts';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAddMerchantRule, useDeleteTransaction, useMerchantRules, useSaveTransaction } from '../lib/queries';
import { Button, CategoryIcon, Field, inputClass, MoneyInput, Sheet, methodColor } from './ui';

const SOURCE_LABEL = { email: 'correo', apple_pay: 'Apple Pay', manual: 'ingreso manual', api: 'Mercado Pago (automático)' } as const;

/** Crear (sin `row`) o editar un movimiento. */
export function TransactionSheet({ row, userId, onClose }: { row?: ChargeRow; userId: string; onClose: () => void }) {
  const rules = useMerchantRules();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const addRule = useAddMerchantRule();

  const [merchant, setMerchant] = useState(row?.merchant ?? '');
  const [amount, setAmount] = useState(row?.total ?? 0);
  const [method, setMethod] = useState<Method>(row?.method ?? 'cmr');
  const [category, setCategory] = useState(row?.category_id ?? 'otros');
  const [categoryTouched, setCategoryTouched] = useState(Boolean(row));
  const [installments, setInstallments] = useState(row?.installments ?? 1);
  const [when, setWhen] = useState(toLocalInput(row?.purchased_at ?? new Date().toISOString()));
  const [note, setNote] = useState(row?.note ?? '');
  const [applyAlways, setApplyAlways] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryChanged = row ? category !== row.category_id : categoryTouched;
  const busy = save.isPending || remove.isPending;

  function onMerchantChange(value: string) {
    setMerchant(value);
    // Al crear, sugiere la categoría según las reglas mientras no la elijas a mano.
    if (!categoryTouched && rules.data) setCategory(categorize(value, rules.data).categoryId);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!merchant.trim()) return setError('Escribe el nombre del comercio');
    if (amount <= 0) return setError('El monto debe ser mayor a cero');
    try {
      await save.mutateAsync({
        id: row?.transaction_id,
        method,
        merchant: merchant.trim(),
        amount,
        purchased_at: fromLocalInput(when),
        installments,
        category_id: category,
        note: note.trim() || null,
      });
      if (applyAlways && categoryChanged) {
        await addRule.mutateAsync({ user_id: userId, pattern: merchantPattern(merchant), category_id: category });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  async function onDelete() {
    if (!row || !confirm(`¿Eliminar ${row.merchant} por ${formatCLP(row.total)}?`)) return;
    try {
      await remove.mutateAsync(row.transaction_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <Sheet title={row ? 'Editar movimiento' : 'Nuevo gasto'} onClose={onClose}>
      <form className="space-y-4" onSubmit={onSubmit}>
        {row && (
          <p className="text-xs text-muted">
            Registrado por {SOURCE_LABEL[row.source]}
            {row.installments > 1 && ` · cuota ${row.installment_no} de ${row.installments} este mes`}
          </p>
        )}

        <Field label="Comercio">
          <input
            className={inputClass}
            value={merchant}
            onChange={(e) => onMerchantChange(e.target.value)}
            placeholder="Ej: Líder Express"
            autoCapitalize="words"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto total">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Cuotas" hint={installments > 1 && amount > 0 ? `${formatCLP(Math.floor(amount / installments))} al mes` : undefined}>
            <select className={inputClass} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              {Array.from({ length: 48 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'Sin cuotas' : `${n} cuotas`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">Método de pago</legend>
          <div className="grid grid-cols-2 gap-2">
            {METHOD_IDS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[15px] ${
                  method === m ? 'border-ink bg-raised font-semibold text-ink' : 'border-hairline text-ink-2'
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ background: methodColor(m) }} aria-hidden />
                {METHODS[m].name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">Categoría</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  setCategory(c.id);
                  setCategoryTouched(true);
                }}
                aria-pressed={category === c.id}
                className={`flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm ${
                  category === c.id ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-hairline text-ink-2'
                }`}
              >
                <span className="scale-75">
                  <CategoryIcon id={c.id} />
                </span>
                {c.name}
              </button>
            ))}
          </div>
          {categoryChanged && merchant.trim() && (
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={applyAlways}
                onChange={(e) => setApplyAlways(e.target.checked)}
              />
              Aplicar siempre a «{merchantPattern(merchant)}»
            </label>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-3">
          <Field label="Fecha y hora">
            <input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Nota (opcional)">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-critical" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {row && (
            <Button type="button" variant="danger" onClick={onDelete} disabled={busy} aria-label="Eliminar movimiento">
              <Trash2 size={18} />
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={busy}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
