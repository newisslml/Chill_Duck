import type { BudgetStatus } from '@shared/alerts.ts';
import { categoryById, METHODS, type Method } from '@shared/domain.ts';
import { formatThousands } from '@shared/money.ts';
import {
  Car,
  CircleCheck,
  CircleEllipsis,
  Clapperboard,
  HeartPulse,
  HousePlug,
  Landmark,
  LoaderCircle,
  OctagonAlert,
  Repeat,
  Shirt,
  ShoppingCart,
  TriangleAlert,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-hairline bg-surface p-4 ${className}`}>{children}</section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, icon, children }: { title: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <LoaderCircle className="animate-spin" size={20} aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
  return (
    <p className="rounded-xl border border-critical/30 bg-critical/10 p-3 text-sm text-ink" role="alert">
      No pude cargar los datos: {message ?? 'error desconocido'}
    </p>
  );
}

const METHOD_COLOR: Record<Method, string> = { cmr: 'var(--color-cmr)', mercadopago: 'var(--color-mp)' };

export function methodColor(method: Method): string {
  return METHOD_COLOR[method];
}

export function MethodBadge({ method }: { method: Method }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-2">
      <span className="size-2 rounded-full" style={{ background: METHOD_COLOR[method] }} aria-hidden />
      {METHODS[method].short}
    </span>
  );
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  shirt: Shirt,
  clapperboard: Clapperboard,
  repeat: Repeat,
  landmark: Landmark,
  car: Car,
  'heart-pulse': HeartPulse,
  'house-plug': HousePlug,
  'circle-ellipsis': CircleEllipsis,
};

export function CategoryIcon({ id, size = 18 }: { id: string; size?: number }) {
  const Icon = CATEGORY_ICONS[categoryById(id).icon] ?? CircleEllipsis;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-grid text-ink-2">
      <Icon size={size} aria-hidden />
    </span>
  );
}

const STATUS: Record<Exclude<BudgetStatus, 'none'>, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-good' },
  warning: { icon: TriangleAlert, className: 'text-warning-ink' },
  over: { icon: OctagonAlert, className: 'text-critical' },
};

/** Estado frente a un tope: siempre ícono + texto, nunca solo color. */
export function StatusChip({ status, children }: { status: BudgetStatus; children: ReactNode }) {
  if (status === 'none') return <p className="text-sm text-ink-2">{children}</p>;
  const { icon: Icon, className } = STATUS[status];
  return (
    <p className={`flex items-center gap-1.5 text-sm font-medium ${className}`}>
      <Icon size={16} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Color de relleno de un medidor según su estado. */
export function statusFill(status: BudgetStatus, base: string): string {
  if (status === 'over') return 'var(--color-critical)';
  if (status === 'warning') return 'var(--color-warning)';
  return base;
}

/** Hoja que sube desde abajo (formularios, informe). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label={title}>
      <button className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-grid" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-ink-2 active:bg-grid" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-hairline bg-raised px-3 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';

/** Input de pesos: muestra "1.200.000" y entrega un entero. */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = '0',
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2">$</span>
      <input
        id={id}
        className={`${inputClass} tabular pl-7`}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={value ? formatThousands(value) : ''}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
      />
    </div>
  );
}

/** Interruptor tipo iOS. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-grid'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        aria-hidden
      />
    </button>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-accent text-on-accent',
    secondary: 'border border-hairline bg-raised text-ink',
    danger: 'border border-critical/40 bg-raised text-critical',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
