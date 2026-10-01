import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { authLanding, supabase } from './supabase';

/** undefined = cargando, null = sin sesión. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}

/**
 * Verdadero mientras la persona llegó por el enlace de "olvidé mi contraseña" y aún no fija la nueva.
 * La sesión del enlace ya es válida, pero la app debe pedir la clave antes de dejarla entrar.
 */
export function usePasswordRecovery(): { recovering: boolean; finish: () => void } {
  const [recovering, setRecovering] = useState(authLanding.recovery);

  useEffect(() => {
    // Si el enlace estaba vencido no hay sesión: sin esto, el próximo login normal caería en esta pantalla.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setRecovering(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { recovering, finish: () => setRecovering(false) };
}
