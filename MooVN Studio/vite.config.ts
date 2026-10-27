import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Filesystem writes are handled by Tauri or browser storage. No privileged
// filesystem or AI proxy endpoints are registered by the development server.
export default defineConfig({
  define: { 'import.meta.env.VITE_EDITION': JSON.stringify('studio') },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', allowedHosts: [] },
});
