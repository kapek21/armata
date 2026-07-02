import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5186, host: true },
  build: { target: 'es2020', sourcemap: true },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
