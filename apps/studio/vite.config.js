import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const lib = (p) => resolve(import.meta.dirname, '../../packages/maxcot/src', p);

export default defineConfig({
  base: './',
  // Use the library's TypeScript sources directly, so edits show up without a build.
  resolve: {
    alias: [
      { find: /^maxcot$/, replacement: lib('index.ts') },
      { find: /^maxcot\/(skins|film|score|voice|sound)$/, replacement: lib('$1/index.ts') }
    ]
  },
  build: {
    // The code panes show the engine's own source via Function#toString, so keep it readable.
    minify: false,
    rollupOptions: {
      input: {
        studio: resolve(import.meta.dirname, 'index.html'),
        sheet: resolve(import.meta.dirname, 'sheet.html'),
        poster: resolve(import.meta.dirname, 'poster.html'),
        example: resolve(import.meta.dirname, 'example.html')
      }
    }
  }
});
