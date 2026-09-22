import { monthLabel, monthName } from '@shared/dates.ts';
import { METHOD_IDS, METHODS, type Method } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import { formatPct, type ChargeRow, type MethodSummary } from '@shared/report.ts';
import { CalendarClock } from 'lucide-react';
import { MethodShareBar } from '../components/MethodShareBar';
import { MonthPicker } from '../components/MonthPicker';
import { RingMeter } from '../components/RingMeter';
import { Card, ErrorNote, methodColor, PageHeader, SectionTitle, Spinner, StatusChip, statusFill } from '../components/ui';
import { useMonth } from '../lib/month';
import { useMonthReport } from '../lib/useMonthReport';

function capMessage(s: MethodSummary): string {
  if (s.cap <= 0) return 'Sin tope: defínelo en Ajustes';
  const left = s.cap - s.spent;
  if (s.status === 'over') return `Superaste el tope por ${formatCLP(-left)}`;
  if (s.status === 'warning') return `Usaste el ${formatPct(s.spent / s.cap)} · quedan ${formatCLP(left)}`;
  return `Te quedan ${formatCLP(left)}`;
}

function MethodCard({
  summary,
  totalSpent,
  committed,
}: {
  summary: MethodSummary;
  totalSpent: number;
  committed: ChargeRow[];
}) {
  const color = methodColor(summary.method);
  const max = summary.cap > 0 ? summary.cap : Math.max(totalSpent, 1);
  const byMonth = new Map<string, number>();
  for (const r of committed) byMonth.set(r.charge_month, (byMonth.get(r.charge_month) ?? 0) + r.charged);
  const upcoming = [...byMonth.entries()].slice(0, 6);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
          <span className="size-3 rounded-full" style={{ background: color }} aria-hidden />
          {METHODS[summary.method].name}
        </h2>
        <span className="text-xs text-muted">{summary.count} movimientos</span>
      </div>

      <RingMeter
        size={184}
        stroke={14}
        value={summary.spent}
        max={max}
        color={statusFill(summary.status, color)}
        trackColor={color}
        label={`${METHODS[summary.method].name}: ${formatCLP(summary.spent)}${summary.cap > 0 ? ` de ${formatCLP(summary.cap)}` : ''}`}
      >
        <p className="text-2xl font-bold text-ink">{formatCLP(summary.spent)}</p>
        <p className="text-xs text-ink-2">
          {summary.cap > 0
            ? `${formatPct(summary.spent / summary.cap)} de ${formatCLP(summary.cap)}`
            : totalSpent > 0
              ? `${formatPct(summary.spent / totalSpent)} del gasto total`
              : 'sin gastos'}
        </p>
      </RingMeter>

      <div className="mt-3 flex justify-center">
        <StatusChip status={summary.status}>{capMessage(summary)}</StatusChip>
      </div>

      {summary.topMerchants.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mb-1 text-xs font-medium text-ink-2">Dónde más gastaste</p>
          <ul>
            {summary.topMerchants.map((m) => (
              <li key={m.merchant} className="flex justify-between gap-3 py-1 text-sm">
                <span className="truncate text-ink">
                  {m.merchant} <span className="text-xs text-muted">× {m.count}</span>
                </span>
                <span className="tabular shrink-0 text-ink">{formatCLP(m.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-2">
            <CalendarClock size={14} aria-hidden /> Cuotas comprometidas
          </p>
          <ul>
            {upcoming.map(([month, amount]) => (
              <li key={month} className="flex justify-between py-1 text-sm">
                <span className="text-ink capitalize">{monthName(month.slice(0, 7))}</span>
                <span className="tabular text-ink">{formatCLP(amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function MetodosPago() {
  const { month } = useMonth();
  const { report, settings, committed, isLoading, error } = useMonthReport(month);

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !report) return <Spinner />;

  const committedBy = (m: Method) => committed.filter((r) => r.method === m);
  // Un método desactivado en Ajustes deja de mostrar su tarjeta (su historial sigue contando en Inicio).
  const activeMethods = METHOD_IDS.filter((m) => (m === 'cmr' ? settings?.cmr_enabled : settings?.mp_enabled) !== false);

  return (
    <>
      <PageHeader title="Métodos de pago" />
      <div className="mb-4 flex justify-center">
        <MonthPicker />
      </div>
      <div className="space-y-4">
        <Card>
          <SectionTitle>Reparto de {monthLabel(month).toLowerCase()}</SectionTitle>
          <MethodShareBar report={report} />
        </Card>
        {activeMethods.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No tienes métodos de pago activos. Actívalos en Ajustes.
          </p>
        )}
        {activeMethods.map((m) => (
          <MethodCard key={m} summary={report.byMethod[m]} totalSpent={report.spent} committed={committedBy(m)} />
        ))}
      </div>
    </>
  );
}
