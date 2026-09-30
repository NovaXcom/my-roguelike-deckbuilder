import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const local = mode === 'singlefile';
  return {
    base: './',
    plugins: local ? [viteSingleFile()] : [],
    build: {
      outDir: local ? 'dist-local' : 'dist',
      chunkSizeWarningLimit: 2000,
      // local: inline every audio file as a data URL inside index.html
      assetsInlineLimit: local ? 100_000_000 : 4096,
    },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
