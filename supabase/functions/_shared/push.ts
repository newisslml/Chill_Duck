// Envío de notificaciones a todos los dispositivos del usuario (solo Deno).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { sendWebPush, type VapidKeys } from './webpush.ts';

export interface PushMessage {
  title: string;
  body: string;
  /** Ruta de la app que se abre al tocar la notificación. */
  url?: string;
  /** Notificaciones con el mismo tag se reemplazan en vez de apilarse. */
  tag?: string;
}

function vapidFromEnv(): VapidKeys | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export async function notifyUser(db: SupabaseClient, userId: string, message: PushMessage): Promise<void> {
  const vapid = vapidFromEnv();
  if (!vapid) {
    console.warn('Push desactivado: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT');
    return;
  }
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        const res = await sendWebPush(sub, message, vapid);
        if (res.status === 404 || res.status === 410) {
          // El dispositivo desinstaló la app o revocó el permiso.
          await db.from('push_subscriptions').delete().eq('id', sub.id);
        } else if (!res.ok) {
          console.error(`Push rechazado (${res.status}):`, await res.text());
        }
      } catch (err) {
        console.error('Error enviando push:', err);
      }
    }),
  );
}
