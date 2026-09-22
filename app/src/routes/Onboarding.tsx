import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, inputClass, MoneyInput } from '../components/ui';
import { useSaveSettings } from '../lib/queries';

/** Se muestra una sola vez, apenas alguien inicia sesión por primera vez (settings.onboarded_at aún null). */
export function Onboarding({ userId }: { userId: string }) {
  const save = useSaveSettings();
  const navigate = useNavigate();
  const [alias, setAlias] = useState('');
  const [salary, setSalary] = useState(0);
  const [extraIncome, setExtraIncome] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!alias.trim()) return setError('Cuéntanos cómo quieres que te llamemos');
    try {
      await save.mutateAsync({
        user_id: userId,
        alias: alias.trim(),
        salary,
        extra_income: extraIncome,
        onboarded_at: new Date().toISOString(),
      });
      navigate('/ajustes', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <img src="/icons/icon-512.png" alt="Chill Duck" className="mb-6 size-[200px] rounded-[44px] shadow-lg" />
      <h1 className="mb-1 text-center text-2xl font-bold text-ink">¡Bienvenido a Chill Duck!</h1>
      <p className="mb-8 text-center text-sm text-ink-2">Cuéntanos un poco de ti para armar tu panel.</p>

      <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit}>
        <Field label="¿Cuál sería tu alias?">
          <input
            className={inputClass}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Ej: Newiss"
            autoCapitalize="words"
            autoFocus
          />
        </Field>
        <Field label="¿Cuánto es tu salario?" hint="Puedes ajustarlo cuando quieras en Ajustes.">
          <MoneyInput value={salary} onChange={setSalary} />
        </Field>
        <Field label="Otros ingresos" hint="Bonos, arriendos, trabajos extra… (opcional)">
          <MoneyInput value={extraIncome} onChange={setExtraIncome} />
        </Field>

        {error && (
          <p className="text-sm text-critical" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Continuar'}
        </Button>
      </form>
    </main>
  );
}
