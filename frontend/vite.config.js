import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/rag-playground/' : '/',
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
});
