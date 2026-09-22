import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { applyTheme, getThemePref } from './lib/theme';

// Antes de pintar nada, para que no haya un parpadeo del tema equivocado.
applyTheme(getThemePref());

const queryClient = new QueryClient({
  defaultOptions: {
    // Al volver a la app desde otra (p. ej. después de pagar) se refrescan los datos.
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
