import { daysLeftInMonth } from '@shared/dates.ts';
import { formatCLP } from '@shared/money.ts';
import { formatPct, type MonthReport } from '@shared/report.ts';
import { FileText, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CategoryList } from '../components/CategoryList';
import { DuckIcon } from '../components/DuckIcon';
import { MonthPicker } from '../components/MonthPicker';
import { MonthReportSheet } from '../components/MonthReportSheet';
import { RingMeter } from '../components/RingMeter';
import { Button, Card, ErrorNote, PageHeader, SectionTitle, Spinner, StatusChip, statusFill } from '../components/ui';
import { useMonth } from '../lib/month';
import { useSavedReport } from '../lib/queries';
import { useMonthReport } from '../lib/useMonthReport';

function capMessage(report: MonthReport): string {
  if (report.capTotal <= 0) return 'Sin tope mensual: defínelo en Ajustes';
  const left = report.remainingToCap!;
  if (report.status === 'over') return `Superaste el tope por ${formatCLP(-left)}`;
  if (report.status === 'warning') return `Usaste el ${formatPct(report.spent / report.capTotal)} del tope · quedan ${formatCLP(left)}`;
  return `Dentro del tope · te quedan ${formatCLP(left)}`;
}

function SavingsCard({ report, isCurrent }: { report: MonthReport; isCurrent: boolean }) {
  const days = daysLeftInMonth();
  const tiles = [
    {
      label: isCurrent ? 'Ahorro a la fecha' : 'Ahorro del mes',
      value: report.saved,
      sub: report.income > 0 ? `${formatPct(Math.max(report.saved, 0) / report.income)} de tus ingresos` : undefined,
    },
    ...(report.savedAtCap !== null
      ? [{ label: 'Si gastas todo el tope', value: report.savedAtCap, sub: 'ahorro mínimo esperado' }]
      : []),
    ...(isCurrent && report.remainingToCap !== null && report.remainingToCap > 0
      ? [
          {
            label: 'Disponible hasta el tope',
            value: report.remainingToCap,
            sub: `≈ ${formatCLP(report.remainingToCap / days)} por día (${days} días)`,
          },
        ]
      : []),
  ];

  return (
    <Card>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <DuckIcon size={18} className="text-duck" aria-hidden /> Ahorro mensual
        </span>
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={`rounded-xl border border-hairline bg-raised p-3 ${tiles.length === 3 && i === 0 ? 'col-span-2' : ''}`}
          >
            <p className="text-xs text-ink-2">{t.label}</p>
            <p className={`mt-0.5 text-xl font-semibold ${t.value < 0 ? 'text-critical' : 'text-ink'}`}>
              {formatCLP(t.value)}
            </p>
            {t.sub && <p className="mt-0.5 text-xs text-muted">{t.sub}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Inicio() {
  const { month, isCurrent } = useMonth();
  const { report, settings, isLoading, error } = useMonthReport(month);
  const savedReport = useSavedReport(month);
  const [params, setParams] = useSearchParams();
  const [showReport, setShowReport] = useState(params.get('informe') === '1');

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !report) return <Spinner />;

  // El anillo completo son los ingresos del mes; sin sueldo configurado, usa el tope.
  const base = report.income > 0 ? report.income : report.capTotal;
  const basis = report.income > 0 ? 'de tus ingresos' : report.capTotal > 0 ? 'del tope' : 'gastado';
  const pct = base > 0 ? formatPct(report.spent / base) : formatCLP(report.spent);

  function closeReport() {
    setShowReport(false);
    if (params.has('informe')) setParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader title="Inicio" icon={<img src="/icons/icon-192.png" alt="" className="size-9 rounded-xl" />}>
        {settings?.alias && <p className="text-xl font-bold text-accent">Hi, {settings.alias}</p>}
      </PageHeader>

      <div className="space-y-4">
        {report.income === 0 && (
          <Link
            to="/ajustes"
            className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm text-ink"
          >
            <Settings size={20} className="shrink-0 text-accent" aria-hidden />
            Ingresa tu sueldo y tus topes en Ajustes para comparar tus gastos contra ellos.
          </Link>
        )}

        <Card className="pt-5">
          <div className="mb-4 flex justify-center">
            <MonthPicker />
          </div>

          <RingMeter
            value={report.spent}
            max={base > 0 ? base : Math.max(report.spent, 1)}
            marker={report.income > 0 && report.capTotal > 0 ? report.capTotal : undefined}
            color={statusFill(report.status, 'var(--color-accent)')}
            trackColor="var(--color-accent)"
            label={`Gastado ${formatCLP(report.spent)} de ${formatCLP(base)} ${basis}`}
          >
            <p className="text-5xl font-bold tracking-tight text-ink">{pct}</p>
            {base > 0 && <p className="text-sm text-ink-2">{basis}</p>}
            <p className="mt-2 text-lg font-semibold text-ink">{formatCLP(report.spent)}</p>
            <p className="text-xs text-muted">{report.count} movimientos</p>
          </RingMeter>

          <div className="mt-4 flex justify-center">
            <StatusChip status={report.status}>{capMessage(report)}</StatusChip>
          </div>

          <ul className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center text-xs text-ink-2">
            <li>
              <span className="mb-1 flex items-center justify-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: statusFill(report.status, 'var(--color-accent)') }} aria-hidden />
                Gastado
              </span>
              <span className="tabular text-sm font-semibold text-ink">{formatCLP(report.spent)}</span>
            </li>
            <li>
              <span className="mb-1 flex items-center justify-center gap-1">
                <span className="h-3 w-0.5 rounded bg-ink" aria-hidden />
                Tope
              </span>
              <span className="tabular text-sm font-semibold text-ink">
                {report.capTotal > 0 ? formatCLP(report.capTotal) : '—'}
              </span>
            </li>
            <li>
              <span className="mb-1 flex items-center justify-center gap-1">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: 'color-mix(in oklab, var(--color-accent) 20%, var(--color-surface))' }}
                  aria-hidden
                />
                Ingresos
              </span>
              <span className="tabular text-sm font-semibold text-ink">
                {report.income > 0 ? formatCLP(report.income) : '—'}
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <SectionTitle>¿En qué se va el dinero?</SectionTitle>
          <CategoryList categories={report.byCategory} />
        </Card>

        <SavingsCard report={report} isCurrent={isCurrent} />

        <Button variant="secondary" className="w-full" onClick={() => setShowReport(true)}>
          <FileText size={18} aria-hidden />
          {savedReport.data ? 'Ver informe del mes' : isCurrent ? 'Ver informe parcial' : 'Ver informe del mes'}
        </Button>
      </div>

      {showReport && (
        <MonthReportSheet report={savedReport.data ?? report} saved={Boolean(savedReport.data)} onClose={closeReport} />
      )}
    </>
  );
}
