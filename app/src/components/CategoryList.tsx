import { formatCLP } from '@shared/money.ts';
import { formatPct, type CategorySummary } from '@shared/report.ts';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { CategoryIcon } from './ui';

/** Categorías de mayor a menor gasto. Barras de un solo tono: el nombre y el ícono identifican. */
export function CategoryList({ categories }: { categories: CategorySummary[] }) {
  const navigate = useNavigate();
  if (!categories.length) {
    return <p className="py-6 text-center text-sm text-muted">Aún no hay gastos este mes.</p>;
  }
  const top = categories[0].amount;

  return (
    <ul className="-mx-1 divide-y divide-hairline">
      {categories.map((c) => (
        <li key={c.id}>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left active:bg-grid/60"
            onClick={() => navigate(`/movimientos?cat=${c.id}`)}
          >
            <CategoryIcon id={c.id} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] text-ink">{c.name}</span>
                <span className="tabular shrink-0 text-[15px] font-semibold text-ink">{formatCLP(c.amount)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-grid">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-700"
                    style={{ width: `${Math.max(2, (c.amount / top) * 100)}%` }}
                  />
                </div>
                <span className="tabular w-16 shrink-0 text-right text-xs text-ink-2">
                  {formatPct(c.share)} · {c.count}
                </span>
              </div>
            </div>
            <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
