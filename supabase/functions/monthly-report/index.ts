// Informe de un mes. Lo llama Apps Script el día 1 para enviarlo por correo desde tu Gmail.
//
// POST /functions/v1/monthly-report   cabecera x-ingest-token: <token de Ajustes>
//   { "month": "2026-09", "save": true }
// Sin `month` usa el mes anterior. Con `save: true` guarda la foto en monthly_reports y avisa por push.
// Responde { month, to, subject, html, text, report }.

import { addMonths, isMonthKey, monthKey, monthName, monthStart } from '../_shared/dates.ts';
import { json, monthCharges, serviceClient, settingsForRequest } from '../_shared/db.ts';
import { formatCLP } from '../_shared/money.ts';
import { notifyUser } from '../_shared/push.ts';
import { buildReport, renderReportEmail } from '../_shared/report.ts';

Deno.serve(async (req) => {
  const db = serviceClient();
  const settings = await settingsForRequest(db, req);
  if (!settings) return json({ error: 'Token inválido' }, 401);

  const params: Record<string, unknown> =
    req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : Object.fromEntries(new URL(req.url).searchParams);
  const month = isMonthKey(params.month) ? params.month : addMonths(monthKey(), -1);
  const save = params.save === true || params.save === 'true';

  const [charges, prevCharges, nextCharges] = await Promise.all([
    monthCharges(db, settings.user_id, month),
    monthCharges(db, settings.user_id, addMonths(month, -1)),
    monthCharges(db, settings.user_id, addMonths(month, 1)),
  ]);
  const report = buildReport({ month, charges, prevCharges, nextCharges, budget: settings });

  if (save) {
    const { error } = await db
      .from('monthly_reports')
      .upsert({ user_id: settings.user_id, month: monthStart(month), data: report });
    if (error) throw error;
    await notifyUser(db, settings.user_id, {
      title: `🦆 Tu informe de ${monthName(month)} está listo`,
      body: `Gastaste ${formatCLP(report.spent)} y ahorraste ${formatCLP(report.saved)}`,
      url: `/?mes=${month}&informe=1`,
      tag: `report-${month}`,
    });
  }

  return json({ month, to: settings.report_email, ...renderReportEmail(report), report });
});
