import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(url && anonKey);

/**
 * Qué trae la URL al volver de un enlace del correo (recuperar contraseña). Se lee antes de crear el
 * cliente, que consume y borra los tokens, para que la app sepa desde el primer render que debe
 * pedir la contraseña nueva en vez de abrir la sesión como si nada.
 */
const landing = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.slice(1));
export const authLanding = {
  recovery: landing.get('type') === 'recovery' && landing.has('access_token'),
  /** El enlace venció, ya se usó o es inválido. */
  linkFailed: landing.has('error'),
};
if (authLanding.linkFailed) history.replaceState(null, '', window.location.pathname + window.location.search);

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  // `implicit` (y no `pkce`) para que el enlace del correo funcione aunque se abra en otro navegador
  // que el de la app instalada, que es lo normal en iPhone (el correo abre Safari, no el ícono).
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

export const functionsUrl = `${url}/functions/v1`;
