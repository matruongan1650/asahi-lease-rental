import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // /api をローカル API サーバー（npm run server, :8787）へプロキシ。
      // 本番(Vercel)では同一オリジンの Serverless Function が処理するため不要。
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
  };
});
