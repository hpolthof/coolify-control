import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Bundle the workspace contract package; keep real npm deps external.
  noExternal: ['@cc/shared'],
  // node:sqlite has no un-prefixed alias, so keep the node: protocol.
  removeNodeProtocol: false,
});
