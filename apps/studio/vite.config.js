import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    // The code panes show the engine's own source via Function#toString, so keep it readable.
    minify: false,
    rollupOptions: {
      input: {
        studio: resolve(import.meta.dirname, 'index.html'),
        sheet: resolve(import.meta.dirname, 'sheet.html'),
        poster: resolve(import.meta.dirname, 'poster.html')
      }
    }
  }
});
