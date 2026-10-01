import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run build       -> dist/        (itch.io 等のWeb公開用)
// npm run build:local -> dist-local/  (index.html 単体・ダブルクリック起動用)
export default defineConfig(({ mode }) => {
  const local = mode === 'singlefile';
  return {
    base: './',
    plugins: local ? [viteSingleFile()] : [],
    build: local
      ? { outDir: 'dist-local', assetsInlineLimit: 100_000_000, cssCodeSplit: false }
      : { outDir: 'dist' },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
