import { useState, type FormEvent } from 'react';
import { Button, Field, inputClass } from '../components/ui';
import { supabase } from '../lib/supabase';

const MIN_LENGTH = 8;

function updateErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'same_password') return 'Elige una contraseña distinta a la anterior.';
  if (error.code === 'weak_password') return 'Esa contraseña es muy débil. Usa una más larga, con números o símbolos.';
  return error.message;
}

/** Se muestra al abrir el enlace del correo de "olvidé mi contraseña": la sesión ya es válida, falta la clave nueva. */
export function NuevaClave({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
    if (password !== repeat) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(updateErrorMessage(error));
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <img src="/icons/icon-192.png" alt="" className="mb-4 size-20 rounded-[22px] shadow-md" />
      <h1 className="text-2xl font-bold text-ink">Crea tu contraseña nueva</h1>
      <p className="mb-8 text-sm text-ink-2">Mínimo {MIN_LENGTH} caracteres.</p>
      <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Contraseña nueva">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Repite la contraseña">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </Field>
        {error && (
          <p className="text-sm text-critical" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </Button>
        <button type="button" className="block w-full text-center text-sm font-medium text-accent" onClick={() => supabase.auth.signOut()}>
          Cancelar
        </button>
      </form>
    </main>
  );
}
