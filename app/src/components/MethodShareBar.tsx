import { METHOD_IDS, METHODS } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import { formatPct, type MonthReport } from '@shared/report.ts';
import { methodColor } from './ui';

/** Reparto del gasto entre CMR y Mercado Pago: barra apilada con etiquetas directas. */
export function MethodShareBar({ report }: { report: MonthReport }) {
  const total = report.spent;
  return (
    <div>
      <div
        className={`flex h-3 gap-0.5 overflow-hidden rounded-full ${total > 0 ? '' : 'bg-grid'}`}
        role="img"
        aria-label={METHOD_IDS.map((m) => `${METHODS[m].name} ${formatCLP(report.byMethod[m].spent)}`).join(', ')}
      >
        {total > 0 &&
          METHOD_IDS.filter((m) => report.byMethod[m].spent > 0).map((m) => (
            <div
              key={m}
              className="h-full transition-[width] duration-700 first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(report.byMethod[m].spent / total) * 100}%`, background: methodColor(m) }}
            />
          ))}
      </div>
      <ul className="mt-2 flex justify-between gap-3 text-sm">
        {METHOD_IDS.map((m) => (
          <li key={m} className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2.5 rounded-full" style={{ background: methodColor(m) }} aria-hidden />
            <span>
              {METHODS[m].name}{' '}
              <span className="tabular font-semibold text-ink">{formatCLP(report.byMethod[m].spent)}</span>
              {total > 0 && <span className="text-muted"> · {formatPct(report.byMethod[m].spent / total)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
