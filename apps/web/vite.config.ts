import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // A single .env at the repo root configures both the API and the frontend.
  envDir: path.resolve(currentDir, '../..'),
  resolve: {
    alias: {
      '@gtip/shared': path.resolve(
        currentDir,
        '../../packages/shared/src/index.ts',
      ),
      '@': path.resolve(currentDir, './src'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
