import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`       -> dist/        (itch.io 等の通常配布)
// `npm run build:local` -> dist-local/  (全アセット埋め込みの単一 index.html)
export default defineConfig(({ mode }) => {
  const local = mode === 'singlefile';
  return {
    base: './',
    plugins: local ? [viteSingleFile()] : [],
    build: {
      outDir: local ? 'dist-local' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
      assetsInlineLimit: local ? 100_000_000 : 4096,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
