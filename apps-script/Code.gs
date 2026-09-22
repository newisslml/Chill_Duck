/**
 * Chill Duck · Google Apps Script (corre en tu cuenta de Gmail)
 *
 * 1. Cada 5 minutos lee los avisos de compra de CMR y Mercado Pago y los envía a Supabase.
 * 2. El día 1 de cada mes envía a tu correo el informe del mes anterior.
 * 3. Una vez al día hace un "ping" para que Supabase gratuito no pause el proyecto.
 *
 * Configuración: Configuración del proyecto (⚙) → Propiedades del script:
 *   SUPABASE_URL   https://xxxx.supabase.co
 *   INGEST_TOKEN   el token de la sección "Captura automática" en Ajustes de la app
 *   CMR_SENDERS    (opcional) remitentes de CMR separados por coma
 *   MP_SENDERS     (opcional) remitentes de Mercado Pago separados por coma
 * Después ejecuta `setup` una vez y acepta los permisos.
 */

var DEFAULT_SENDERS = {
  CMR_SENDERS: 'bancofalabella.cl',
  MP_SENDERS: 'mercadopago.com, mercadopago.cl',
};

/** Días hacia atrás que revisa cada pasada (cubre correos que llegan con atraso). */
var LOOKBACK_DAYS = 2;

/**
 * Lee un valor de las propiedades del script o, si no está, de CHILL_DUCK_CONFIG
 * (Config.gs, archivo generado al subir con clasp que no va al repositorio).
 */
function setting_(key) {
  var fromProps = PropertiesService.getScriptProperties().getProperty(key);
  if (fromProps) return fromProps;
  return typeof CHILL_DUCK_CONFIG !== 'undefined' ? CHILL_DUCK_CONFIG[key] || '' : '';
}

function config_() {
  var url = setting_('SUPABASE_URL').replace(/\/+$/, '');
  var token = setting_('INGEST_TOKEN');
  if (!url || !token) throw new Error('Faltan SUPABASE_URL o INGEST_TOKEN en las propiedades del script');
  var senders = ['CMR_SENDERS', 'MP_SENDERS']
    .map(function (key) { return setting_(key) || DEFAULT_SENDERS[key]; })
    .join(',')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  return { url: url, token: token, senders: senders };
}

function post_(path, payload) {
  var cfg = config_();
  var res = UrlFetchApp.fetch(cfg.url + '/functions/v1/' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-token': cfg.token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var body = {};
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    body = { raw: res.getContentText() };
  }
  return { ok: res.getResponseCode() === 200, code: res.getResponseCode(), body: body };
}

/**
 * Envía a Supabase los correos de compra recientes. Recuerda los ids ya enviados
 * para no repetirlos (y aunque se repitan, el servidor los descarta por id).
 */
function scanPurchaseEmails() {
  scan_(LOOKBACK_DAYS, false);
}

/** Ejecútalo a mano una vez para cargar el historial reciente (últimos 35 días). */
function backfill() {
  scan_(35, true);
}

function scan_(days, ignoreSeen) {
  // En la carga de historial no se envían notificaciones por cada compra antigua.
  var silent = ignoreSeen;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // otra ejecución sigue corriendo
  try {
    var cfg = config_();
    var props = PropertiesService.getScriptProperties();
    var stored = props.getProperties();
    var since = Date.now() - days * 86400000;
    var query = 'from:(' + cfg.senders.join(' OR ') + ') newer_than:' + days + 'd';
    // Resumen que se reporta a Supabase para ver desde la app si la lectura funciona.
    var stats = { at: new Date().toISOString(), query: query, found: 0, sent: 0, skipped: 0, failed: 0, results: {}, errors: [] };

    try {
      GmailApp.search(query, 0, 200).forEach(function (thread) {
        thread.getMessages().forEach(function (msg) {
          stats.found++;
          var key = 'seen_' + msg.getId();
          if (msg.getDate().getTime() < since || (!ignoreSeen && stored[key])) {
            stats.skipped++;
            return;
          }
          var res = post_('ingest', {
            source: 'email',
            messageId: msg.getId(),
            from: msg.getFrom(),
            subject: msg.getSubject(),
            date: msg.getDate().toISOString(),
            body: msg.getPlainBody(),
            silent: silent,
          });
          if (res.ok) {
            props.setProperty(key, String(Date.now()));
            stats.sent++;
            stats.results[res.body.status] = (stats.results[res.body.status] || 0) + 1;
            console.log(msg.getSubject() + ' → ' + res.body.status + (res.body.reason ? ' (' + res.body.reason + ')' : ''));
          } else {
            stats.failed++; // se reintenta en la próxima pasada
            if (stats.errors.length < 3) stats.errors.push('HTTP ' + res.code + ': ' + JSON.stringify(res.body).slice(0, 200));
            console.error(msg.getSubject() + ' → HTTP ' + res.code + ' ' + JSON.stringify(res.body));
          }
        });
      });
      pruneSeen_(props, stored);
    } catch (err) {
      stats.errors.push(String(err && err.message ? err.message : err));
      throw err;
    } finally {
      console.log(JSON.stringify(stats));
      post_('ingest', { source: 'ping', scan: stats });
    }
  } finally {
    lock.releaseLock();
  }
}

/** Olvida los ids de más de 5 días (ya quedaron fuera de la ventana de búsqueda). */
function pruneSeen_(props, stored) {
  var limit = Date.now() - 5 * 86400000;
  Object.keys(stored).forEach(function (key) {
    if (key.indexOf('seen_') === 0 && Number(stored[key]) < limit) props.deleteProperty(key);
  });
}

function monthOf_(date) {
  return Utilities.formatDate(date, 'America/Santiago', 'yyyy-MM');
}

function previousMonth_() {
  var now = new Date();
  return monthOf_(new Date(now.getFullYear(), now.getMonth() - 1, 15));
}

function sendReport_(month, save) {
  var res = post_('monthly-report', { month: month, save: save });
  if (!res.ok) throw new Error('monthly-report respondió ' + res.code + ': ' + JSON.stringify(res.body));
  MailApp.sendEmail({
    to: res.body.to || Session.getEffectiveUser().getEmail(),
    subject: (save ? '' : '[Prueba] ') + res.body.subject,
    body: res.body.text,
    htmlBody: res.body.html,
    name: 'Chill Duck',
  });
  console.log('Informe de ' + month + ' enviado');
}

/** Disparador del día 1: informe del mes que terminó, guardado en la app. */
function sendMonthlyReport() {
  sendReport_(previousMonth_(), true);
}

/** Ejecútalo a mano para recibir ahora un informe del mes en curso (no se guarda). */
function sendTestReport() {
  sendReport_(monthOf_(new Date()), false);
}

function heartbeat() {
  var res = post_('ingest', { source: 'ping' });
  if (!res.ok) throw new Error('Ping falló: HTTP ' + res.code + ' ' + JSON.stringify(res.body));
}

/**
 * Implementación web (opcional): permite el botón "Enviar informe de prueba" de la app.
 * GET ?action=test-report&month=2026-09&token=<INGEST_TOKEN>
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.token !== config_().token) return json_({ error: 'Token inválido' });
  if (p.action === 'test-report') {
    sendReport_(/^\d{4}-\d{2}$/.test(p.month || '') ? p.month : monthOf_(new Date()), false);
    return json_({ ok: true });
  }
  return json_({ error: 'Acción desconocida' });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecútalo a mano para ver quién te envía correos de CMR / Mercado Pago (últimos 30 días)
 * y ajustar CMR_SENDERS o MP_SENDERS si hace falta.
 */
function diagnostico() {
  var seen = {};
  var lines = [];
  GmailApp.search('(CMR OR Falabella OR "Mercado Pago" OR mercadopago) newer_than:30d', 0, 60).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var key = msg.getFrom() + ' | ' + msg.getSubject();
      if (seen[key] || lines.length >= 40) return;
      seen[key] = true;
      lines.push({ from: msg.getFrom(), subject: msg.getSubject(), date: msg.getDate().toISOString() });
      console.log(msg.getFrom() + '  →  ' + msg.getSubject());
    });
  });
  var senders = config_().senders;
  console.log('Remitentes que revisa el script: ' + senders.join(', '));
  // Se guarda en Supabase para revisarlo sin copiar este registro a mano.
  post_('ingest', { source: 'ping', diagnostic: { at: new Date().toISOString(), senders: senders, lines: lines } });
}

/**
 * Ejecútalo una vez: valida la configuración y crea los disparadores del informe mensual
 * y el heartbeat. No programa la lectura de correos: ejecuta `diagnostico` primero (o revisa
 * Ajustes → Captura automática en la app) y, solo si tu banco SÍ envía avisos de compra por
 * correo, activa `scanPurchaseEmails` a mano con `activarLecturaCorreos()`.
 */
function setup() {
  heartbeat(); // falla aquí si la URL o el token están mal
  var handlers = ['scanPurchaseEmails', 'sendMonthlyReport', 'heartbeat'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendMonthlyReport').timeBased().onMonthDay(1).atHour(8).create();
  ScriptApp.newTrigger('heartbeat').timeBased().everyDays(1).atHour(12).create();
  console.log('Disparadores creados: informe mensual y heartbeat.');
  diagnostico();
  console.log('Listo. Revisa el diagnóstico en Ajustes → Captura automática de la app.');
}

/** Actívalo solo si `diagnostico` (o la app) muestra avisos reales de compra por correo. */
function activarLecturaCorreos() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanPurchaseEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scanPurchaseEmails').timeBased().everyMinutes(5).create();
  scanPurchaseEmails();
  console.log('Lectura de correos activada cada 5 minutos.');
}
