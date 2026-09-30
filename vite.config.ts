import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode singlefile` (npm run build:local) => dist-local/index.html (all JS/CSS/images inlined)
export default defineConfig(({ mode }) => {
  const local = mode === 'singlefile';
  return {
    base: './',
    plugins: local ? [viteSingleFile()] : [],
    build: {
      outDir: local ? 'dist-local' : 'dist',
      chunkSizeWarningLimit: 2000,
    },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
