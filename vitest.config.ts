import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  test: {
    include: ['supabase/**/*.test.ts', 'tests/**/*.test.ts', 'app/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
