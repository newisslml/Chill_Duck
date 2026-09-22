import { CreditCard, ReceiptText, Settings, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { DuckIcon } from './DuckIcon';

const TABS: { to: string; label: string; aria: string; icon: LucideIcon | typeof DuckIcon; duck?: boolean }[] = [
  { to: '/', label: 'Inicio', aria: 'Inicio', icon: DuckIcon, duck: true },
  { to: '/metodos', label: 'Métodos', aria: 'Métodos de pago', icon: CreditCard },
  { to: '/movimientos', label: 'Movimientos', aria: 'Movimientos', icon: ReceiptText },
  { to: '/ajustes', label: 'Ajustes', aria: 'Ajustes', icon: Settings },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
      aria-label="Navegación principal"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ to, label, aria, icon: Icon, duck }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              aria-label={aria}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={24}
                    strokeWidth={isActive ? 2.25 : 1.75}
                    className={duck ? 'text-duck' : undefined}
                    aria-hidden
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
