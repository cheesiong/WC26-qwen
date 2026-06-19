import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Target Chrome 79 so optional chaining (?.) gets transpiled —
    // required for react-snap's bundled Chromium 71 to run the pre-render snapshot.
    target: ['chrome79', 'es2019'],
  },
  server: {
    port: 6001,
    proxy: {
      '/api': {
        target: 'http://localhost:6173',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
