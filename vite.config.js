import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures assets are loaded relative to index.html in Electron production
  server: {
    port: 5173,
    strictPort: true
  }
});
