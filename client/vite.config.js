// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When running inside the Docker dev container, DOCKER=true is set in
// client/Dockerfile. That flips on two things Docker specifically needs:
//   - binding to 0.0.0.0 (not just localhost) so the port mapped by
//     docker-compose is actually reachable from the host machine
//   - polling-based file watching, since inotify file-change events from
//     a bind-mounted volume don't always reach the container (especially
//     on Docker Desktop for Mac/Windows) - without this, hot reload can
//     silently stop working for edits made on the host.
// Local (non-Docker) `npm run dev` is unaffected and keeps the faster,
// non-polling watcher.
const isDocker = process.env.DOCKER === 'true';

// The Vite dev server's own proxy (for relative /api/... calls) runs
// INSIDE the container, so "localhost" there means the container itself,
// not the backend container. VITE_API_PROXY_TARGET lets docker-compose
// point it at the backend by service name instead.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: isDocker ? '0.0.0.0' : true,
    strictPort: true,
    watch: isDocker ? { usePolling: true, interval: 1000 } : undefined,
    proxy: {
      // Lets the frontend call relative /api/... paths in dev without CORS
      // headaches; the app itself uses VITE_API_URL directly (see
      // src/api/axios.js), so this proxy is a convenience fallback.
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
