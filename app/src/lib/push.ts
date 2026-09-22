import { supabase } from './supabase';

export type PushState = 'needs-install' | 'unsupported' | 'default' | 'denied' | 'granted';

/** La PWA está abierta desde el ícono de inicio (requisito de iOS para push). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushState(): PushState {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isStandalone() ? 'unsupported' : 'needs-install';
  return Notification.permission;
}

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Pide permiso y registra este iPhone. Debe llamarse desde un toque del usuario. */
export async function enablePush(userId: string): Promise<void> {
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapid) throw new Error('Falta VITE_VAPID_PUBLIC_KEY en la configuración');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No diste permiso para notificaciones');

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(vapid),
    }));

  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('Suscripción push incompleta');
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;

  await registration.showNotification('Chill Duck', {
    body: 'Listo: te avisaré cada vez que registre un pago 🦆',
    icon: '/icons/icon-192.png',
    tag: 'push-enabled',
  });
}
