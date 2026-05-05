import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/admin': { target: 'http://localhost:5000', changeOrigin: true },
      '/billing': { target: 'http://localhost:5000', changeOrigin: true },
      '/heartbeat': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
