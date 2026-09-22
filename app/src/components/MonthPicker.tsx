import { addMonths, monthLabel } from '@shared/dates.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonth } from '../lib/month';

export function MonthPicker() {
  const { month, setMonth, isCurrent } = useMonth();
  return (
    <div className="flex items-center gap-1 rounded-full border border-hairline bg-surface p-1">
      <button
        className="rounded-full p-1.5 text-ink-2 active:bg-grid"
        onClick={() => setMonth(addMonths(month, -1))}
        aria-label="Mes anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-ink">{monthLabel(month)}</span>
      <button
        className="rounded-full p-1.5 text-ink-2 active:bg-grid disabled:opacity-30"
        onClick={() => setMonth(addMonths(month, 1))}
        disabled={isCurrent}
        aria-label="Mes siguiente"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
