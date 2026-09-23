import type { Session } from '@supabase/supabase-js';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { BottomNav } from './components/BottomNav';
import { ErrorNote, Spinner } from './components/ui';
import { MonthProvider } from './lib/month';
import { useRealtimeSync, useSettings } from './lib/queries';
import { useSession } from './lib/session';
import { isConfigured } from './lib/supabase';
import { Ajustes } from './routes/Ajustes';
import { Inicio } from './routes/Inicio';
import { Login } from './routes/Login';
import { MetodosPago } from './routes/MetodosPago';
import { Movimientos } from './routes/Movimientos';
import { Notificaciones } from './routes/Notificaciones';
import { Onboarding } from './routes/Onboarding';

function Shell({ session }: { session: Session }) {
  useRealtimeSync(session.user.id);
  const settings = useSettings();

  if (settings.isLoading) return <Spinner />;
  if (settings.error) return <ErrorNote error={settings.error} />;
  // Primera vez que inicias sesión: pide alias, sueldo e ingresos antes de dejarte entrar.
  if (!settings.data?.onboarded_at) return <Onboarding userId={session.user.id} />;

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+96px)]">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/metodos" element={<MetodosPago />} />
          <Route path="/movimientos" element={<Movimientos userId={session.user.id} />} />
          <Route path="/ajustes" element={<Ajustes email={session.user.email ?? ''} />} />
          <Route path="/notificaciones" element={<Notificaciones />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
      {import.meta.env.MODE === 'demo' && (
        <p className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+4px)] left-1/2 z-50 -translate-x-1/2 rounded-full bg-warning px-3 py-0.5 text-[11px] font-semibold text-black shadow">
          Modo demo · datos de ejemplo
        </p>
      )}
    </div>
  );
}

export function App() {
  const session = useSession();

  if (!isConfigured) {
    return (
      <main className="mx-auto max-w-md p-6 text-sm text-ink">
        <h1 className="mb-2 text-lg font-semibold">Falta configurar Supabase</h1>
        <p className="text-ink-2">
          Copia <code>app/.env.example</code> como <code>app/.env</code> (o define las variables en Vercel) y vuelve a
          compilar.
        </p>
      </main>
    );
  }
  if (session === undefined) return <Spinner />;
  if (!session) return <Login />;

  return (
    <BrowserRouter>
      <MonthProvider>
        <Shell session={session} />
      </MonthProvider>
    </BrowserRouter>
  );
}
