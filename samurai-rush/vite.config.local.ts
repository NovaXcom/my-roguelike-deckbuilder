import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Local build: everything inlined into dist-local/index.html (double-click to play). */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-local', chunkSizeWarningLimit: 4000 },
});
