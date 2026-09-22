import type { Session } from '@supabase/supabase-js';

const demoSession = { user: { id: 'demo', email: 'demo@chillduck.app' } } as Session;

/** Modo demo: siempre hay una sesión iniciada. */
export function useSession(): Session {
  return demoSession;
}
