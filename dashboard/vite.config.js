import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker, the bot is reachable via service name 'bot'.
// Locally (outside Docker), use localhost.
const API_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':       { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
      '/uploads':   { target: API_TARGET, changeOrigin: true },
    },
  },
});
