import { useState, type FormEvent } from 'react';
import { Button, Field, inputClass } from '../components/ui';
import { authLanding, supabase } from '../lib/supabase';

function resetErrorMessage(error: { code?: string; message: string }): string {
  // Supabase deja un correo de recuperación por minuto y por cuenta.
  if (error.code === 'over_email_send_rate_limit') return 'Ya te enviamos un correo hace poco. Espera un minuto y vuelve a intentar.';
  return error.message;
}

export function Login() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    authLanding.linkFailed ? 'El enlace venció o ya se usó. Pide uno nuevo con "¿Olvidaste tu contraseña?".' : null,
  );
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message);
    setBusy(false);
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // El enlace del correo vuelve a la app; esa URL debe estar en Supabase → Authentication → URL Configuration.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setError(resetErrorMessage(error));
    else setSent(true);
    setBusy(false);
  }

  function switchMode(next: 'login' | 'forgot') {
    setMode(next);
    setError(null);
    setSent(false);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <img src="/icons/icon-192.png" alt="" className="mb-4 size-20 rounded-[22px] shadow-md" />
      <h1 className="text-2xl font-bold text-ink">Chill Duck</h1>
      <p className="mb-8 text-sm text-ink-2">Tus gastos de CMR y Mercado Pago, sin estrés.</p>
      {mode === 'login' ? (
        <form className="w-full max-w-sm space-y-4" onSubmit={onLogin}>
          <Field label="Correo">
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="off"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Contraseña">
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && (
            <p className="text-sm text-critical" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
          <button type="button" className="block w-full text-center text-sm font-medium text-accent" onClick={() => switchMode('forgot')}>
            ¿Olvidaste tu contraseña?
          </button>
        </form>
      ) : (
        <form className="w-full max-w-sm space-y-4" onSubmit={onForgot}>
          <p className="text-sm text-ink-2">Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.</p>
          <Field label="Correo">
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="off"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          {sent && (
            <p className="text-sm text-good" role="status">
              Listo. Si ese correo tiene una cuenta, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.
            </p>
          )}
          {error && (
            <p className="text-sm text-critical" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Enviando…' : sent ? 'Enviar de nuevo' : 'Enviar enlace'}
          </Button>
          <button type="button" className="block w-full text-center text-sm font-medium text-accent" onClick={() => switchMode('login')}>
            Volver a iniciar sesión
          </button>
        </form>
      )}
    </main>
  );
}
