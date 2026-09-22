import { addMonths, monthStart } from '@shared/dates.ts';
import { buildReport } from '@shared/report.ts';
import { useMemo } from 'react';
import { useCharges, useCommittedCharges, useSettings } from './queries';

/** Resumen del mes con los mismos cálculos que el correo de fin de mes. */
export function useMonthReport(month: string) {
  const settings = useSettings();
  const charges = useCharges(month);
  const prev = useCharges(addMonths(month, -1));
  const committed = useCommittedCharges(month);

  const report = useMemo(() => {
    if (!settings.data || !charges.data) return null;
    const next = monthStart(addMonths(month, 1));
    return buildReport({
      month,
      charges: charges.data,
      budget: settings.data,
      prevCharges: prev.data,
      nextCharges: committed.data?.filter((r) => r.charge_month === next),
    });
  }, [month, settings.data, charges.data, prev.data, committed.data]);

  return {
    report,
    settings: settings.data,
    charges: charges.data,
    committed: committed.data ?? [],
    isLoading: settings.isLoading || charges.isLoading,
    error: settings.error ?? charges.error,
  };
}
