// Fechas en hora de Chile. Los meses se identifican como 'YYYY-MM'.
//
// "Mes" es el mes de facturación de CMR, no el calendario: cierra el día 24 y se nombra por el mes en
// que cierra. El mes '2026-10' va del 25 de septiembre al 24 de octubre (ambos incluidos), así que lo
// comprado desde el 25 ya cuenta en el mes siguiente. Aplica igual a CMR y a Mercado Pago.
// Misma regla que la función SQL `month_of` (supabase/migrations/20261001000000_billing_cycle.sql).

export const TZ = 'America/Santiago';

/** Último día de cada mes de facturación. Lo comprado después de este día cae en el mes siguiente. */
export const BILLING_CLOSING_DAY = 24;

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const pad = (n: number) => String(n).padStart(2, '0');

/** Hora "de reloj" en Chile para un instante dado. */
export function wallTime(date: Date): WallTime {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as unknown as WallTime;
}

/** Convierte una fecha/hora de reloj en Chile al instante UTC correspondiente. */
export function zonedToUtc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let ts = target;
  // Dos pasadas bastan para converger incluso en los cambios de horario.
  for (let i = 0; i < 2; i++) {
    const w = wallTime(new Date(ts));
    ts += target - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  }
  return new Date(ts);
}

/** Mes de facturación (en Chile) al que pertenece un instante: 'YYYY-MM'. */
export function monthKey(date: Date = new Date()): string {
  const w = wallTime(date);
  const calendar = `${w.year}-${pad(w.month)}`;
  return w.day > BILLING_CLOSING_DAY ? addMonths(calendar, 1) : calendar;
}

/** Día (en Chile) de un instante: 'YYYY-MM-DD'. */
export function dayKey(date: Date | string): string {
  const w = wallTime(typeof date === 'string' ? new Date(date) : date);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

function splitMonth(key: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Mes inválido: "${key}"`);
  return [Number(m[1]), Number(m[2])];
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 'YYYY-MM' → 'YYYY-MM-01' (formato de la columna `charge_month`). */
export function monthStart(key: string): string {
  splitMonth(key);
  return `${key}-01`;
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = splitMonth(key);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Días que quedan en el mes de facturación actual, contando hoy y el día de cierre. */
export function daysLeftInMonth(now: Date = new Date()): number {
  const w = wallTime(now);
  // Date.UTC normaliza el mes 12 → enero del año siguiente.
  const closing = Date.UTC(w.year, w.month - 1 + (w.day > BILLING_CLOSING_DAY ? 1 : 0), BILLING_CLOSING_DAY);
  return Math.round((closing - Date.UTC(w.year, w.month - 1, w.day)) / 86_400_000) + 1;
}

/** Primer instante (UTC) del mes de facturación: el día 25 del mes anterior, a las 00:00 de Chile. */
export function monthStartInstant(key: string): Date {
  const [y, m] = splitMonth(key);
  return zonedToUtc(y, m - 1, BILLING_CLOSING_DAY + 1);
}

const shortMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-10' → '25 sep – 24 oct': los días que abarca el mes de facturación. */
export function monthPeriodLabel(key: string): string {
  const [y, m] = splitMonth(key);
  const start = new Date(Date.UTC(y, m - 2, BILLING_CLOSING_DAY + 1));
  return `${start.getUTCDate()} ${shortMonths[start.getUTCMonth()]} – ${BILLING_CLOSING_DAY} ${shortMonths[m - 1]}`;
}

const monthNames = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthOnly = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** '2026-09' → 'Septiembre 2026' */
export function monthLabel(key: string): string {
  const [y, m] = splitMonth(key);
  return capitalize(monthNames.format(new Date(Date.UTC(y, m - 1, 15))).replace(' de ', ' '));
}

/** '2026-09' → 'septiembre' */
export function monthName(key: string): string {
  const [y, m] = splitMonth(key);
  return monthOnly.format(new Date(Date.UTC(y, m - 1, 15)));
}

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dayFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Hora de la compra: '13:45' */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** 'Lunes 21 de septiembre' */
export function formatDay(iso: string): string {
  return capitalize(dayFormatter.format(new Date(iso)).replace(',', ''));
}

/** Instante → valor para <input type="datetime-local"> en hora de Chile. */
export function toLocalInput(iso: string): string {
  const w = wallTime(new Date(iso));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Valor de <input type="datetime-local"> (hora de Chile) → ISO UTC. */
export function fromLocalInput(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error(`Fecha inválida: "${value}"`);
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString();
}
