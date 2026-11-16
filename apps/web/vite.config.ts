import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' : GitHub Pages alt dizini dahil her yerde göreli yollarla çalışır.
export default defineConfig({
  base: './',
  plugins: [react()],
});
