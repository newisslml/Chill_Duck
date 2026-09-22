import { monthLabel } from '@shared/dates.ts';
import { METHOD_IDS, METHODS } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import { formatPct, monthOverMonth, type MonthReport } from '@shared/report.ts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { MethodShareBar } from './MethodShareBar';
import { SectionTitle, Sheet, StatusChip } from './ui';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-raised p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function MonthReportSheet({
  report,
  saved,
  onClose,
}: {
  report: MonthReport;
  /** true si es la foto guardada al cerrar el mes. */
  saved: boolean;
  onClose: () => void;
}) {
  const delta = monthOverMonth(report);
  return (
    <Sheet title={`Informe · ${monthLabel(report.month)}`} onClose={onClose}>
      <p className="-mt-2 mb-4 text-xs text-muted">
        {saved ? 'Informe de cierre de mes (el mismo que llegó a tu correo).' : 'Informe parcial con los datos a la fecha.'}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Gastado" value={formatCLP(report.spent)} sub={`${report.count} movimientos`} />
        <Stat
          label="Ingresos"
          value={formatCLP(report.income)}
          sub={report.income > 0 ? `gastaste el ${formatPct(report.spent / report.income)}` : undefined}
        />
        <Stat label="Ahorro del mes" value={formatCLP(report.saved)} />
        <div className="rounded-xl border border-hairline bg-raised p-3">
          <p className="text-xs text-ink-2">Vs mes anterior</p>
          {delta === null ? (
            <p className="mt-0.5 text-lg font-semibold text-ink">—</p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold text-ink">
              {delta > 0 ? <TrendingUp size={18} aria-hidden /> : <TrendingDown size={18} aria-hidden />}
              {delta > 0 ? '+' : '−'}
              {formatPct(Math.abs(delta))}
            </p>
          )}
          {Boolean(report.prevSpent) && <p className="text-xs text-muted">{formatCLP(report.prevSpent!)}</p>}
        </div>
      </div>

      {report.capTotal > 0 && (
        <div className="mt-3">
          <StatusChip status={report.status}>
            {report.status === 'over'
              ? `Superaste el tope por ${formatCLP(-report.remainingToCap!)}`
              : `Tope ${formatCLP(report.capTotal)} · usaste el ${formatPct(report.spent / report.capTotal)}`}
          </StatusChip>
        </div>
      )}

      <div className="mt-6">
        <SectionTitle>Por método de pago</SectionTitle>
        <MethodShareBar report={report} />
      </div>

      <div className="mt-6">
        <SectionTitle>Categorías con más gasto</SectionTitle>
        <ul className="divide-y divide-hairline">
          {report.byCategory.slice(0, 5).map((c) => (
            <li key={c.id} className="flex justify-between py-2 text-[15px]">
              <span className="text-ink">{c.name}</span>
              <span className="tabular text-ink">
                {formatCLP(c.amount)} <span className="text-xs text-muted">· {formatPct(c.share)}</span>
              </span>
            </li>
          ))}
          {!report.byCategory.length && <li className="py-2 text-sm text-muted">Sin gastos.</li>}
        </ul>
      </div>

      <div className="mt-6">
        <SectionTitle>Comercios principales</SectionTitle>
        <ul className="divide-y divide-hairline">
          {report.topMerchants.map((m) => (
            <li key={m.merchant} className="flex justify-between gap-3 py-2 text-[15px]">
              <span className="truncate text-ink">
                {m.merchant} <span className="text-xs text-muted">× {m.count}</span>
              </span>
              <span className="tabular shrink-0 text-ink">{formatCLP(m.amount)}</span>
            </li>
          ))}
          {!report.topMerchants.length && <li className="py-2 text-sm text-muted">—</li>}
        </ul>
      </div>

      {report.nextCommitted.total > 0 && (
        <div className="mt-6">
          <SectionTitle>Cuotas comprometidas para el próximo mes</SectionTitle>
          <ul className="divide-y divide-hairline">
            {METHOD_IDS.filter((m) => report.nextCommitted[m] > 0).map((m) => (
              <li key={m} className="flex justify-between py-2 text-[15px]">
                <span className="text-ink">{METHODS[m].name}</span>
                <span className="tabular text-ink">{formatCLP(report.nextCommitted[m])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
