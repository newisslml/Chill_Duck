import { useState, type FormEvent } from 'react';
import { Button, Field, inputClass } from '../components/ui';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message);
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <img src="/icons/icon-192.png" alt="" className="mb-4 size-20 rounded-[22px] shadow-md" />
      <h1 className="text-2xl font-bold text-ink">Chill Duck</h1>
      <p className="mb-8 text-sm text-ink-2">Tus gastos de CMR y Mercado Pago, sin estrés.</p>
      <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit}>
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
      </form>
    </main>
  );
}
