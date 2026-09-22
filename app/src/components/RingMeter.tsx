import type { ReactNode } from 'react';

interface RingMeterProps {
  /** Valor gastado. */
  value: number;
  /** Lo que representa el 100% del anillo (sueldo o tope). */
  max: number;
  /** Posición de la marca del tope, en las mismas unidades que `value`. */
  marker?: number;
  /** Color del relleno (el caller lo cambia según el estado). */
  color: string;
  /** Color base para el riel: un tono claro del mismo color. */
  trackColor: string;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}

/** Medidor circular: el anillo completo es el 100%; la marca indica el tope. */
export function RingMeter({
  value,
  max,
  marker,
  color,
  trackColor,
  size = 232,
  stroke = 16,
  label,
  children,
}: RingMeterProps) {
  const center = size / 2;
  const r = (size - stroke) / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  const markerFraction = marker && max > 0 && marker <= max ? marker / max : null;

  const tick = (() => {
    if (markerFraction === null) return null;
    const angle = markerFraction * 2 * Math.PI;
    const inner = r - stroke / 2 - 4;
    const outer = r + stroke / 2 + 4;
    return {
      x1: center + inner * Math.cos(angle),
      y1: center + inner * Math.sin(angle),
      x2: center + outer * Math.cos(angle),
      y2: center + outer * Math.sin(angle),
    };
  })();

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <title>{label}</title>
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            strokeWidth={stroke}
            style={{ stroke: `color-mix(in oklab, ${trackColor} 20%, var(--color-surface))` }}
          />
          {fraction > 0 && (
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap={fraction < 1 ? 'round' : 'butt'}
              strokeDasharray={`${fraction * circumference} ${circumference}`}
              style={{ stroke: color, transition: 'stroke-dasharray 700ms ease, stroke 300ms' }}
            />
          )}
          {tick && (
            <>
              <line {...tick} strokeWidth={6} strokeLinecap="round" style={{ stroke: 'var(--color-surface)' }} />
              <line {...tick} strokeWidth={2.5} strokeLinecap="round" style={{ stroke: 'var(--color-ink)' }} />
            </>
          )}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
