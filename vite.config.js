import { defineConfig, loadEnv } from 'vite';
import { createHandler } from './server/recommend.js';
import { SECURITY_HEADERS } from './server/headers.js';

// Serves the same handler as api/recommend.js during `npm run dev` / `npm run preview`.
function apiPlugin(env) {
  const handler = createHandler({ env });
  const mount = (server) => {
    server.middlewares.use('/api/recommend', (req, res) => {
      handler(req, res).catch((e) => { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); });
    });
  };
  return { name: 'api-recommend', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  return {
    plugins: [apiPlugin(env)],
    preview: { headers: SECURITY_HEADERS },
    build: { target: 'es2022', sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.js'] },
  };
});
