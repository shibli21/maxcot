import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Test against the engine's sources, like the studio does.
const lib = (p: string) => fileURLToPath(new URL('../maxcot/src/' + p, import.meta.url));
export default defineConfig({
  resolve: { alias: [{ find: /^maxcot$/, replacement: lib('index.ts') }, { find: /^maxcot\/(skins|film|score|voice|sound|puppet)$/, replacement: lib('$1/index.ts') }] }
});
