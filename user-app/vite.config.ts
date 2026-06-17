import uniPlugin from '@dcloudio/vite-plugin-uni';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const uni = typeof uniPlugin === 'function' ? uniPlugin : uniPlugin.default;

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
