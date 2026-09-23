import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { useUnreadNotifications } from '../lib/queries';

export function NotificationBell() {
  const unread = useUnreadNotifications();
  return (
    <Link
      to="/notificaciones"
      className="relative rounded-full border border-hairline bg-raised p-2 text-ink-2 active:bg-grid"
      aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
    >
      <Bell size={20} aria-hidden />
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent"
          aria-hidden
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
