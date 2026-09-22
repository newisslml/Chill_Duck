// Modo demo: no hay backend. Lo que intente hablar con Supabase avisa en vez de fallar en silencio.

const unavailable = () => {
  throw new Error('No disponible en el modo demo');
};

export const isConfigured = true;

export const functionsUrl = 'https://tu-proyecto.supabase.co/functions/v1';

export const supabase = {
  auth: { signOut: () => alert('Modo demo: no hay sesión que cerrar.') },
  from: unavailable,
};
