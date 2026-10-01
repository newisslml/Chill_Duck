import type { Session } from '@supabase/supabase-js';

const demoSession = { user: { id: 'demo', email: 'demo@chillduck.app' } } as Session;

/** Modo demo: siempre hay una sesión iniciada. */
export function useSession(): Session {
  return demoSession;
}

/** Modo demo: no hay correos, nunca se recupera una contraseña. */
export function usePasswordRecovery(): { recovering: boolean; finish: () => void } {
  return { recovering: false, finish: () => {} };
}
