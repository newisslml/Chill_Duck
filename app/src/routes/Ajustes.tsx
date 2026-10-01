import { BILLING_CLOSING_DAY, formatDay, formatTime, monthKey } from '@shared/dates.ts';
import { METHODS } from '@shared/domain.ts';
import { formatCLP } from '@shared/money.ts';
import {
  Bell,
  BellOff,
  Check,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  inputClass,
  methodColor,
  MoneyInput,
  PageHeader,
  SectionTitle,
  Spinner,
  Switch,
} from '../components/ui';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';
import { enablePush, pushState, type PushState } from '../lib/push';
import { useDismissIngestError, useIngestErrors, useSaveSettings, useSettings, type Settings } from '../lib/queries';
import { functionsUrl, supabase } from '../lib/supabase';

type Form = Pick<Settings, 'salary' | 'extra_income' | 'cap_total' | 'cap_cmr' | 'cap_mp' | 'cmr_enabled' | 'mp_enabled'> & {
  report_email: string;
  apps_script_url: string;
};

function toForm(s: Settings): Form {
  return {
    salary: s.salary,
    extra_income: s.extra_income,
    cap_total: s.cap_total,
    cap_cmr: s.cap_cmr,
    cap_mp: s.cap_mp,
    cmr_enabled: s.cmr_enabled,
    mp_enabled: s.mp_enabled,
    report_email: s.report_email ?? '',
    apps_script_url: s.apps_script_url ?? '',
  };
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 48 * 60) return `hace ${Math.round(minutes / 60)} h`;
  return `hace ${Math.round(minutes / 1440)} días`;
}

/** Si la captura automática está funcionando: Mercado Pago (API) y el script de Gmail. */
function CaptureStatus({ settings }: { settings: Settings }) {
  const mp = settings.mp_sync;
  const mpStale = mp && Date.now() - Date.parse(mp.at) > 15 * 60_000;
  // El disparador corre cada 5 minutos; sin lecturas recientes es que no está activado.
  const scan = settings.last_scan;
  const scanStale = !scan || Date.now() - Date.parse(scan.at) > 15 * 60_000;
  const rows: { label: string; ok: boolean; text: string }[] = [
    {
      label: 'Mercado Pago',
      ok: Boolean(mp && !mp.errors.length && !mpStale),
      text: !mp
        ? 'Aún no se sincroniza'
        : mp.errors.length
          ? `Error ${ago(mp.at)}: ${mp.errors[0]}`
          : `Sincronizado ${ago(mp.at)}`,
    },
    {
      label: 'Script de Gmail',
      ok: Boolean(settings.script_seen_at),
      text: settings.script_seen_at ? `Activo · ${ago(settings.script_seen_at)}` : 'Falta ejecutar setup',
    },
    {
      label: 'Correos Banco Falabella',
      ok: Boolean(scan && !scan.errors.length && !scanStale),
      text: !scan
        ? 'Falta ejecutar activarLecturaCorreos'
        : scan.errors.length
          ? `Error ${ago(scan.at)}: ${scan.errors[0]}`
          : scanStale
            ? `Falta ejecutar activarLecturaCorreos (última lectura ${ago(scan.at)})`
            : `Correos revisados ${ago(scan.at)}`,
    },
  ];
  return (
    <ul className="space-y-1.5 rounded-xl border border-hairline bg-raised p-3 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-2">
          {r.ok ? (
            <Check size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
          ) : (
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning-ink" aria-hidden />
          )}
          <span className="text-ink">
            {r.label}: <span className="text-ink-2">{r.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!secret);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink-2">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-hairline bg-raised px-3 py-2.5 text-sm text-ink">
          {visible ? value : '•'.repeat(24)}
        </code>
        {secret && (
          <button className="p-2 text-ink-2" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ocultar' : 'Mostrar'}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
        <button className="p-2 text-ink-2" onClick={copy} aria-label={`Copiar ${label}`}>
          {copied ? <Check size={18} className="text-good" /> : <Copy size={18} />}
        </button>
      </div>
    </div>
  );
}

const PUSH_TEXT: Record<PushState, ReactNode> = {
  'needs-install': (
    <>
      Para recibir avisos, instala la app: en Safari toca <b>Compartir → Agregar a inicio</b> y ábrela desde el ícono.
    </>
  ),
  unsupported: 'Este dispositivo no soporta notificaciones web (requiere iOS 16.4 o superior).',
  default: 'Recibe un aviso cada vez que se registre un pago, con tu total del mes.',
  denied: 'Bloqueaste las notificaciones. Actívalas en Ajustes del iPhone → Notificaciones → Chill Duck.',
  granted: 'Notificaciones activas en este dispositivo.',
};

function NotificationsCard({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState>(pushState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEnable() {
    setBusy(true);
    setError(null);
    try {
      await enablePush(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar');
    } finally {
      setState(pushState());
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Notificaciones</SectionTitle>
      <p className="mb-3 text-sm text-ink-2">{PUSH_TEXT[state]}</p>
      {(state === 'default' || state === 'granted') && (
        <Button variant={state === 'granted' ? 'secondary' : 'primary'} className="w-full" onClick={onEnable} disabled={busy}>
          {state === 'granted' ? <Bell size={18} /> : <BellOff size={18} />}
          {busy ? 'Activando…' : state === 'granted' ? 'Volver a registrar este iPhone' : 'Activar notificaciones'}
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <Link to="/notificaciones" className="mt-3 block text-center text-sm font-medium text-accent">
        Ver historial de notificaciones
      </Link>
    </Card>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'Automático', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
];

/** Local al dispositivo: no pasa por Supabase ni por el botón "Guardar cambios". */
function AppearanceCard() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  return (
    <Card>
      <SectionTitle>Apariencia</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            type="button"
            key={value}
            onClick={() => {
              setThemePref(value);
              setPref(value);
            }}
            aria-pressed={pref === value}
            className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs ${
              pref === value ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-hairline text-ink-2'
            }`}
          >
            <Icon size={18} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function IngestErrorsCard() {
  const errors = useIngestErrors();
  const dismiss = useDismissIngestError();
  if (!errors.data?.length) return null;
  return (
    <Card className="border-warning/60">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <TriangleAlert size={18} className="text-warning-ink" aria-hidden /> Avisos que no pude leer
        </span>
      </SectionTitle>
      <p className="mb-2 text-xs text-muted">
        Regístralos a mano en Movimientos (+). Si se repiten, el formato del correo cambió: guarda uno en
        <code> supabase/functions/_shared/parsers/fixtures</code>.
      </p>
      <ul className="divide-y divide-hairline">
        {errors.data.map((e) => (
          <li key={e.id} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate text-ink">{e.payload.subject ?? e.payload.merchant ?? 'Sin asunto'}</p>
              <p className="text-xs text-muted">
                {formatDay(e.created_at)} {formatTime(e.created_at)} · {e.error}
              </p>
            </div>
            <button className="p-1 text-ink-2" onClick={() => dismiss.mutate(e.id)} aria-label="Descartar">
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Ajustes({ email }: { email: string }) {
  const settings = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Form | null>(() => (settings.data ? toForm(settings.data) : null));
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && !form) setForm(toForm(settings.data));
  }, [settings.data, form]);

  if (settings.error) return <ErrorNote error={settings.error} />;
  if (!settings.data || !form) return <Spinner />;
  const s = settings.data;

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(s));
  const income = form.salary + form.extra_income;
  const methodCaps = form.cap_cmr + form.cap_mp;

  const current = form;
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save.mutateAsync({
      user_id: s.user_id,
      ...current,
      report_email: current.report_email.trim() || null,
      apps_script_url: current.apps_script_url.trim() || null,
    });
    setSaved(true);
  }

  async function regenerateToken() {
    if (!confirm('Se generará un token nuevo. Tendrás que actualizarlo en Apps Script y en el Atajo de iOS. ¿Continuar?')) return;
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
    await save.mutateAsync({ user_id: s.user_id, ingest_token: token });
  }

  async function sendTestReport() {
    if (!s.apps_script_url) return;
    setTestState('Enviando…');
    const url = new URL(s.apps_script_url);
    url.searchParams.set('action', 'test-report');
    url.searchParams.set('month', monthKey());
    url.searchParams.set('token', s.ingest_token);
    try {
      // Apps Script no expone CORS: la respuesta es opaca, pero la ejecución ocurre igual.
      await fetch(url, { mode: 'no-cors' });
      setTestState('Listo: revisa tu correo en un minuto.');
    } catch {
      setTestState('No pude contactar a Apps Script. Revisa la URL.');
    }
  }

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-4">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Card className="space-y-3">
            <SectionTitle>Ingresos del mes</SectionTitle>
            <Field label="Sueldo líquido">
              <MoneyInput value={form.salary} onChange={set('salary')} />
            </Field>
            <Field label="Otros ingresos" hint="Bonos, arriendos, trabajos extra… Se suman al sueldo.">
              <MoneyInput value={form.extra_income} onChange={set('extra_income')} />
            </Field>
            <p className="text-sm text-ink-2">
              Total que se usa como 100%: <b className="tabular text-ink">{formatCLP(income)}</b>
            </p>
          </Card>

          <Card className="space-y-3">
            <SectionTitle>Métodos de pago</SectionTitle>
            <p className="text-xs text-muted">
              Desactivar un método detiene la captura de pagos nuevos (Atajos o API). El historial que ya tiene no se
              borra ni se saca de Inicio.
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[15px] text-ink">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: methodColor('cmr') }} aria-hidden />
                {METHODS.cmr.name}
              </span>
              <Switch checked={form.cmr_enabled} onChange={set('cmr_enabled')} label="Activar CMR Falabella" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[15px] text-ink">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: methodColor('mercadopago') }} aria-hidden />
                {METHODS.mercadopago.name}
              </span>
              <Switch checked={form.mp_enabled} onChange={set('mp_enabled')} label="Activar Mercado Pago" />
            </div>
          </Card>

          <Card className="space-y-3">
            <SectionTitle>Topes de gasto mensual</SectionTitle>
            <Field label="Tope general" hint={income > 0 && form.cap_total > 0 ? `Ahorro mínimo esperado: ${formatCLP(income - form.cap_total)}` : 'Déjalo en 0 si no quieres tope.'}>
              <MoneyInput value={form.cap_total} onChange={set('cap_total')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <div className={form.cmr_enabled ? undefined : 'pointer-events-none opacity-40'}>
                <Field label="Tope CMR" hint={form.cmr_enabled ? undefined : 'Método desactivado'}>
                  <MoneyInput value={form.cap_cmr} onChange={set('cap_cmr')} />
                </Field>
              </div>
              <div className={form.mp_enabled ? undefined : 'pointer-events-none opacity-40'}>
                <Field label="Tope Mercado Pago" hint={form.mp_enabled ? undefined : 'Método desactivado'}>
                  <MoneyInput value={form.cap_mp} onChange={set('cap_mp')} />
                </Field>
              </div>
            </div>
            {form.cap_total > 0 && methodCaps > form.cap_total && (
              <p className="flex items-center gap-1.5 text-xs text-warning-ink">
                <TriangleAlert size={14} aria-hidden /> Los topes por método suman {formatCLP(methodCaps)}, más que el general.
              </p>
            )}
            {income > 0 && form.cap_total > income && (
              <p className="flex items-center gap-1.5 text-xs text-warning-ink">
                <TriangleAlert size={14} aria-hidden /> El tope general supera tus ingresos.
              </p>
            )}
          </Card>

          <Card className="space-y-3">
            <SectionTitle>Informe mensual por correo</SectionTitle>
            <Field label="Enviar a" hint={`Se envía el día ${BILLING_CLOSING_DAY + 1} de cada mes, cuando cierra tu facturación, desde tu Gmail (Apps Script).`}>
              <input
                type="email"
                className={inputClass}
                value={form.report_email}
                onChange={(e) => set('report_email')(e.target.value)}
                placeholder={email}
                autoCapitalize="off"
              />
            </Field>
            <Field label="URL de Apps Script (opcional)" hint="La URL de la implementación web; habilita el botón de prueba.">
              <input
                type="url"
                className={inputClass}
                value={form.apps_script_url}
                onChange={(e) => set('apps_script_url')(e.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec"
                autoCapitalize="off"
              />
            </Field>
          </Card>

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-20">
            <Button type="submit" className="w-full shadow-lg" disabled={!dirty || save.isPending}>
              {save.isPending ? 'Guardando…' : saved && !dirty ? '✓ Guardado' : 'Guardar cambios'}
            </Button>
            {save.error && <p className="mt-2 text-sm text-critical">{(save.error as Error).message}</p>}
          </div>
        </form>

        <Button
          variant="secondary"
          className="w-full"
          onClick={sendTestReport}
          disabled={!s.apps_script_url}
          title={s.apps_script_url ? undefined : 'Configura la URL de Apps Script'}
        >
          <Mail size={18} /> Enviar informe de prueba
        </Button>
        {testState && <p className="text-center text-sm text-ink-2">{testState}</p>}

        <NotificationsCard userId={s.user_id} />

        <AppearanceCard />

        <Card className="space-y-3">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Smartphone size={18} className="text-accent" aria-hidden /> Captura automática
            </span>
          </SectionTitle>
          <CaptureStatus settings={s} />
          <p className="text-sm text-ink-2">
            Lo que pagas con saldo, QR o Mercado Crédito se sincroniza solo cada 2 minutos. Lo que pagas con la{' '}
            <b>tarjeta</b> de Mercado Pago y todo lo de CMR llega por Atajos de iOS, que envían el pago a esta
            dirección con tu token.
          </p>
          <CopyField label="URL de registro" value={`${functionsUrl}/ingest`} />
          <CopyField label="Token" value={s.ingest_token} secret />
          <Button variant="secondary" className="w-full" onClick={regenerateToken}>
            <RefreshCw size={16} /> Generar token nuevo
          </Button>
        </Card>

        <IngestErrorsCard />

        <Card>
          <SectionTitle>Cuenta</SectionTitle>
          <p className="mb-3 text-sm text-ink-2">{email}</p>
          <Button variant="secondary" className="w-full" onClick={() => supabase.auth.signOut()}>
            <LogOut size={18} /> Cerrar sesión
          </Button>
        </Card>
      </div>
    </>
  );
}
