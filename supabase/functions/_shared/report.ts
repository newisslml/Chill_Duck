// Resumen de un mes. Lo usan la PWA (Inicio, Métodos, informe) y la Edge Function
// `monthly-report` (correo de fin de mes), para que el cálculo sea uno solo.

import { budgetStatus, type BudgetStatus } from './alerts.ts';
import { normalizeMerchant } from './categorize.ts';
import { categoryById, METHOD_IDS, METHODS, type Method, type Source } from './domain.ts';
import { addMonths, monthLabel, monthPeriodLabel, monthStartInstant } from './dates.ts';
import { formatCLP } from './money.ts';

/** Fila de la vista `month_charges`: lo que una compra carga a un mes (una cuota). */
export interface ChargeRow {
  transaction_id: string;
  method: Method;
  merchant: string;
  category_id: string;
  needs_review: boolean;
  purchased_at: string;
  source: Source;
  note: string | null;
  installments: number;
  installment_no: number;
  /** Monto total de la compra. */
  total: number;
  /** Lo que se carga a `charge_month`. */
  charged: number;
  charge_month: string;
}

export interface Budget {
  salary: number;
  extra_income: number;
  cap_total: number;
  cap_cmr: number;
  cap_mp: number;
}

export interface MerchantSummary {
  merchant: string;
  amount: number;
  count: number;
}

export interface MethodSummary {
  method: Method;
  spent: number;
  cap: number;
  status: BudgetStatus;
  count: number;
  topMerchants: MerchantSummary[];
}

export interface CategorySummary {
  id: string;
  name: string;
  amount: number;
  /** Fracción del gasto total del mes (0–1). */
  share: number;
  count: number;
}

export interface MonthReport {
  month: string;
  income: number;
  capTotal: number;
  spent: number;
  /** Ingresos − gastado. */
  saved: number;
  /** Ingresos − tope: lo que ahorrarías si gastas justo el tope. */
  savedAtCap: number | null;
  /** Tope − gastado. */
  remainingToCap: number | null;
  status: BudgetStatus;
  count: number;
  byMethod: Record<Method, MethodSummary>;
  byCategory: CategorySummary[];
  topMerchants: MerchantSummary[];
  prevSpent: number | null;
  /** Cuotas de compras ya hechas que caen el mes siguiente. */
  nextCommitted: Record<Method, number> & { total: number };
}

export interface ReportInput {
  month: string;
  charges: readonly ChargeRow[];
  budget: Budget;
  prevCharges?: readonly ChargeRow[];
  nextCharges?: readonly ChargeRow[];
}

const sum = (rows: readonly { charged: number }[]) => rows.reduce((acc, r) => acc + r.charged, 0);

function topMerchants(rows: readonly ChargeRow[], limit: number): MerchantSummary[] {
  const groups = new Map<string, MerchantSummary>();
  for (const r of rows) {
    const key = normalizeMerchant(r.merchant);
    const g = groups.get(key) ?? { merchant: r.merchant, amount: 0, count: 0 };
    g.amount += r.charged;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export function methodCap(budget: Budget, method: Method): number {
  return method === 'cmr' ? budget.cap_cmr : budget.cap_mp;
}

export function buildReport({ month, charges, budget, prevCharges, nextCharges }: ReportInput): MonthReport {
  const income = budget.salary + budget.extra_income;
  const spent = sum(charges);
  const capTotal = budget.cap_total;

  const byMethod = Object.fromEntries(
    METHOD_IDS.map((method) => {
      const rows = charges.filter((r) => r.method === method);
      const methodSpent = sum(rows);
      const cap = methodCap(budget, method);
      return [
        method,
        {
          method,
          spent: methodSpent,
          cap,
          status: budgetStatus(methodSpent, cap),
          count: rows.length,
          topMerchants: topMerchants(rows, 3),
        },
      ];
    }),
  ) as Record<Method, MethodSummary>;

  const categories = new Map<string, CategorySummary>();
  for (const r of charges) {
    const c = categories.get(r.category_id) ?? {
      id: r.category_id,
      name: categoryById(r.category_id).name,
      amount: 0,
      share: 0,
      count: 0,
    };
    c.amount += r.charged;
    c.count += 1;
    categories.set(r.category_id, c);
  }
  const byCategory = [...categories.values()]
    .map((c) => ({ ...c, share: spent > 0 ? c.amount / spent : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // Comprometido = cuotas de compras ya hechas al cierre de este mes (la cuota 1 de una compra en CMR
  // también cae el mes siguiente). Las compras posteriores no cuentan: aún no existían.
  const nextStart = monthStartInstant(addMonths(month, 1)).getTime();
  const committedRows = (nextCharges ?? []).filter((r) => r.installments > 1 && Date.parse(r.purchased_at) < nextStart);
  const nextCommitted = {
    cmr: sum(committedRows.filter((r) => r.method === 'cmr')),
    mercadopago: sum(committedRows.filter((r) => r.method === 'mercadopago')),
    total: sum(committedRows),
  };

  return {
    month,
    income,
    capTotal,
    spent,
    saved: income - spent,
    savedAtCap: capTotal > 0 ? income - capTotal : null,
    remainingToCap: capTotal > 0 ? capTotal - spent : null,
    status: budgetStatus(spent, capTotal),
    count: charges.length,
    byMethod,
    byCategory,
    topMerchants: topMerchants(charges, 5),
    prevSpent: prevCharges ? sum(prevCharges) : null,
    nextCommitted,
  };
}

/** Variación porcentual respecto al mes anterior, o null si no hay base. */
export function monthOverMonth(report: MonthReport): number | null {
  if (report.prevSpent === null || report.prevSpent === 0) return null;
  return (report.spent - report.prevSpent) / report.prevSpent;
}

export const formatPct = (ratio: number) => `${Math.round(ratio * 100)}%`;

// ---------------------------------------------------------------------------
// Correo HTML del informe. Estilos en línea porque Gmail ignora <style>.

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const INK = '#0b0b0b';
const INK_2 = '#52514e';
const MUTED = '#898781';
const HAIRLINE = '#e1e0d9';
const ACCENT = '#4a3aa7';
const METHOD_COLOR: Record<Method, string> = { cmr: '#1baf7a', mercadopago: '#2a78d6' };
const STATUS_TEXT: Record<BudgetStatus, { label: string; color: string }> = {
  none: { label: 'Sin tope configurado', color: INK_2 },
  ok: { label: '✓ Dentro del tope', color: '#006300' },
  warning: { label: '⚠ Sobre el 80% del tope', color: '#8a5a00' },
  over: { label: '✕ Tope superado', color: '#d03b3b' },
};

function bar(ratio: number, color: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return `<div style="background:${HAIRLINE};border-radius:4px;height:8px;width:100%;"><div style="background:${color};border-radius:4px;height:8px;width:${pct}%;"></div></div>`;
}

function row(label: string, value: string, strong = false): string {
  return `<tr><td style="padding:6px 0;color:${INK_2};font-size:14px;">${label}</td><td style="padding:6px 0;text-align:right;font-size:14px;color:${INK};${strong ? 'font-weight:600;' : ''}">${value}</td></tr>`;
}

function section(title: string, body: string): string {
  return `<h2 style="margin:28px 0 10px;font-size:15px;color:${INK};">${title}</h2>${body}`;
}

export function renderReportEmail(report: MonthReport): { subject: string; html: string; text: string } {
  const label = monthLabel(report.month);
  const status = STATUS_TEXT[report.status];
  const delta = monthOverMonth(report);
  const deltaText =
    delta === null ? '—' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${formatPct(Math.abs(delta))} vs mes anterior`;

  const summary = `
    <table role="presentation" width="100%" style="border-collapse:collapse;">
      ${row('Gastado', formatCLP(report.spent), true)}
      ${row('Ingresos del mes', formatCLP(report.income))}
      ${report.capTotal > 0 ? row('Tope general', formatCLP(report.capTotal)) : ''}
      ${row('Ahorro del mes', formatCLP(report.saved), true)}
      ${row('Movimientos', String(report.count))}
      ${row('Mes anterior', report.prevSpent === null ? '—' : `${formatCLP(report.prevSpent)} · ${deltaText}`)}
    </table>
    ${report.income > 0 ? `<p style="margin:12px 0 6px;font-size:13px;color:${INK_2};">Gastaste el ${formatPct(report.spent / report.income)} de tus ingresos</p>${bar(report.spent / report.income, ACCENT)}` : ''}
    <p style="margin:12px 0 0;font-size:13px;font-weight:600;color:${status.color};">${status.label}</p>`;

  const methods = METHOD_IDS.map((m) => {
    const s = report.byMethod[m];
    const capText = s.cap > 0 ? ` de ${formatCLP(s.cap)} (${formatPct(s.spent / s.cap)})` : '';
    return `<p style="margin:10px 0 4px;font-size:14px;color:${INK};"><span style="color:${METHOD_COLOR[m]};">●</span> ${METHODS[m].name}: <b>${formatCLP(s.spent)}</b>${capText} · ${s.count} mov.</p>${s.cap > 0 ? bar(s.spent / s.cap, METHOD_COLOR[m]) : ''}`;
  }).join('');

  const categories = report.byCategory.length
    ? report.byCategory
        .slice(0, 5)
        .map(
          (c) =>
            `<p style="margin:10px 0 4px;font-size:14px;color:${INK};">${escapeHtml(c.name)} <span style="float:right;">${formatCLP(c.amount)} · ${formatPct(c.share)}</span></p>${bar(c.share, ACCENT)}`,
        )
        .join('')
    : `<p style="color:${MUTED};font-size:14px;">Sin gastos este mes.</p>`;

  const merchants = report.topMerchants.length
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;">${report.topMerchants
        .map((t) => row(`${escapeHtml(t.merchant)} <span style="color:${MUTED};">× ${t.count}</span>`, formatCLP(t.amount)))
        .join('')}</table>`
    : `<p style="color:${MUTED};font-size:14px;">—</p>`;

  const committed =
    report.nextCommitted.total > 0
      ? section(
          'Cuotas comprometidas para el próximo mes',
          `<table role="presentation" width="100%" style="border-collapse:collapse;">${METHOD_IDS.filter((m) => report.nextCommitted[m] > 0)
            .map((m) => row(METHODS[m].name, formatCLP(report.nextCommitted[m])))
            .join('')}${row('Total', formatCLP(report.nextCommitted.total), true)}</table>`,
        )
      : '';

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f9f9f7;font-family:-apple-system,system-ui,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px;background:#fcfcfb;">
    <p style="margin:0;font-size:13px;color:${MUTED};">🦆 Chill Duck · Informe mensual</p>
    <h1 style="margin:4px 0 2px;font-size:22px;color:${INK};">${label}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:${MUTED};">Compras del ${monthPeriodLabel(report.month)}</p>
    ${summary}
    ${section('Por método de pago', methods)}
    ${section('Categorías con más gasto', categories)}
    ${section('Comercios principales', merchants)}
    ${committed}
    <p style="margin:32px 0 0;font-size:12px;color:${MUTED};">Las compras en cuotas cuentan solo la cuota de cada mes.</p>
  </div></body></html>`;

  const text = [
    `Chill Duck · Informe de ${label}`,
    `Gastado: ${formatCLP(report.spent)} de ${formatCLP(report.income)} de ingresos`,
    `Ahorro del mes: ${formatCLP(report.saved)}`,
    ...(report.capTotal > 0 ? [`Tope general: ${formatCLP(report.capTotal)} — ${status.label}`] : []),
    ...METHOD_IDS.map((m) => `${METHODS[m].name}: ${formatCLP(report.byMethod[m].spent)}`),
    '',
    'Categorías:',
    ...report.byCategory.slice(0, 5).map((c) => `- ${c.name}: ${formatCLP(c.amount)} (${formatPct(c.share)})`),
  ].join('\n');

  return { subject: `🦆 Informe de ${label}: gastaste ${formatCLP(report.spent)}`, html, text };
}
