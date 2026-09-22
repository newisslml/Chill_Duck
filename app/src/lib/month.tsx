import { isMonthKey, monthKey } from '@shared/dates.ts';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface MonthState {
  month: string;
  setMonth: (month: string) => void;
  isCurrent: boolean;
}

const MonthContext = createContext<MonthState | null>(null);

/** Mes seleccionado, compartido entre Inicio, Métodos y Movimientos. */
export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('mes');
    return isMonthKey(fromUrl) ? fromUrl : monthKey();
  });
  return (
    <MonthContext.Provider value={{ month, setMonth, isCurrent: month === monthKey() }}>
      {children}
    </MonthContext.Provider>
  );
}

export function useMonth(): MonthState {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth fuera de MonthProvider');
  return ctx;
}
