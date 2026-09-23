import { dayKey, formatDay, formatTime } from '@shared/dates.ts';
import { BellOff, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, ErrorNote, PageHeader, Spinner } from '../components/ui';
import {
  useClearNotifications,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
} from '../lib/queries';

export function Notificaciones() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const clear = useClearNotifications();
  // Las no leídas al entrar se siguen destacando durante esta visita, aunque ya se marcaron.
  const [unreadOnEntry, setUnreadOnEntry] = useState<Set<number> | null>(null);

  useEffect(() => {
    if (!notifications.data || unreadOnEntry) return;
    const unread = new Set(notifications.data.filter((n) => !n.read_at).map((n) => n.id));
    setUnreadOnEntry(unread);
    if (unread.size) markRead.mutate();
  }, [notifications.data, unreadOnEntry, markRead]);

  const groups = useMemo(() => {
    const byDay = new Map<string, AppNotification[]>();
    for (const n of notifications.data ?? []) {
      const key = dayKey(n.created_at);
      byDay.set(key, [...(byDay.get(key) ?? []), n]);
    }
    return [...byDay.entries()].map(([key, items]) => ({ key, label: formatDay(items[0].created_at), items }));
  }, [notifications.data]);

  function onClear() {
    if (confirm('¿Borrar todo el historial de notificaciones?')) clear.mutate();
  }

  const isUnread = (n: AppNotification) => !n.read_at || Boolean(unreadOnEntry?.has(n.id));

  return (
    <>
      <PageHeader
        title="Notificaciones"
        icon={
          <button
            className="-ml-2 rounded-full p-1.5 text-ink-2 active:bg-grid"
            onClick={() => navigate(-1)}
            aria-label="Volver"
          >
            <ChevronLeft size={24} />
          </button>
        }
      >
        {Boolean(notifications.data?.length) && (
          <button
            className="rounded-full p-2 text-ink-2 active:bg-grid disabled:opacity-50"
            onClick={onClear}
            disabled={clear.isPending}
            aria-label="Borrar historial"
          >
            <Trash2 size={20} />
          </button>
        )}
      </PageHeader>

      {notifications.error ? (
        <ErrorNote error={notifications.error} />
      ) : notifications.isLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted">
          <BellOff size={28} aria-hidden />
          <p>Aún no hay notificaciones.</p>
          <p className="max-w-xs text-xs">Aquí quedará cada aviso de Chill Duck: compras registradas, topes y el informe del mes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</h2>
              <Card className="divide-y divide-hairline overflow-hidden px-0 py-0">
                {g.items.map((n) => {
                  const unread = isUnread(n);
                  const content = (
                    <>
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? 'bg-accent' : 'bg-transparent'}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`text-[15px] text-ink ${unread ? 'font-semibold' : 'font-medium'}`}>
                            {n.title}
                            {unread && <span className="sr-only"> (nueva)</span>}
                          </span>
                          <span className="tabular shrink-0 text-xs text-muted">{formatTime(n.created_at)}</span>
                        </span>
                        {n.body && <span className="mt-0.5 block text-sm whitespace-pre-line text-ink-2">{n.body}</span>}
                      </span>
                      {n.url && <ChevronRight size={18} className="mt-1 shrink-0 text-muted" aria-hidden />}
                    </>
                  );
                  const className = `flex w-full items-start gap-2.5 px-3 py-3 text-left ${unread ? 'bg-accent/5' : ''}`;
                  return n.url ? (
                    <button key={n.id} className={`${className} active:bg-grid`} onClick={() => navigate(n.url!)}>
                      {content}
                    </button>
                  ) : (
                    <div key={n.id} className={className}>
                      {content}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
