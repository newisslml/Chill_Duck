import { formatTime } from '@shared/dates.ts';
import { formatCLP } from '@shared/money.ts';
import type { ChargeRow } from '@shared/report.ts';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CategoryIcon, MethodBadge } from './ui';

/** Ancho del botón rojo que queda al descubierto al deslizar. */
const REVEAL = 84;
/** Deslizar más de esto y se borra directo al soltar, sin necesidad de tocar el botón. */
const DELETE_AT = 160;
/** Bajo esto, el gesto cuenta como toque (abre/cierra) en vez de arrastre. */
const TAP_TOLERANCE = 6;

interface Drag {
  x: number;
  startDragX: number;
  moved: boolean;
}

export function TransactionRow({
  row,
  onClick,
  onDelete,
  isOpen,
  onOpenChange,
}: {
  row: ChargeRow;
  onClick: () => void;
  /** Borra este movimiento. Se llama tanto al deslizar más allá de DELETE_AT como al tocar "Eliminar". */
  onDelete: () => void;
  /** Si esta fila está abierta (deslizada). Al abrir una, las demás se cierran (ver Movimientos.tsx). */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settled = isOpen ? -REVEAL : 0;
  const [dragX, setDragX] = useState(settled);
  const drag = useRef<Drag | null>(null);

  // La fila se abrió/cerró desde afuera (otra fila se abrió y esta se cerró): sincroniza, salvo que
  // el usuario la esté arrastrando en este momento.
  useEffect(() => {
    if (!drag.current) setDragX(settled);
  }, [settled]);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, startDragX: dragX, moved: false };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.x;
    if (Math.abs(delta) > TAP_TOLERANCE) drag.current.moved = true;
    setDragX(Math.min(0, Math.max(-(DELETE_AT + 40), drag.current.startDragX + delta)));
  }

  function onPointerUp() {
    const state = drag.current;
    drag.current = null;
    if (!state) return;

    if (!state.moved) {
      // Un toque: si estaba abierta la cierra, si estaba cerrada abre el detalle.
      if (isOpen) onOpenChange(false);
      else onClick();
      setDragX(settled);
      return;
    }
    if (dragX <= -DELETE_AT) {
      onOpenChange(false);
      onDelete();
    } else if (dragX <= -REVEAL / 2) {
      onOpenChange(true);
    } else {
      onOpenChange(false);
    }
  }

  return (
    <div className="relative overflow-hidden bg-surface">
      <button
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-[84px] flex-col items-center justify-center gap-1 bg-critical text-white"
        aria-label={`Eliminar ${row.merchant}`}
        tabIndex={isOpen ? 0 : -1}
      >
        <Trash2 size={18} aria-hidden />
        <span className="text-xs font-medium">Eliminar</span>
      </button>
      <button
        className="relative flex w-full touch-pan-y items-center gap-3 bg-surface px-1 py-3 text-left select-none active:bg-grid/60"
        style={{ transform: `translateX(${dragX}px)`, transition: drag.current ? 'none' : 'transform 200ms ease' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <CategoryIcon id={row.category_id} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-ink">{row.merchant}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <MethodBadge method={row.method} />
            <span className="tabular">{formatTime(row.purchased_at)}</span>
            {row.needs_review && (
              <span className="inline-flex items-center gap-0.5 text-warning-ink">
                <TriangleAlert size={12} aria-hidden /> Revisar categoría
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-[15px] font-semibold text-ink">{formatCLP(row.charged)}</p>
          {row.installments > 1 && (
            <p className="tabular text-xs text-muted">
              Cuota {row.installment_no}/{row.installments}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}
