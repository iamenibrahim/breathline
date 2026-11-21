import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The production build is a single self-contained HTML file (fonts, scripts and
// styles inlined). It makes no network requests, so after one install/build it
// can be opened from disk or served locally with the network disabled.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100000000, cssCodeSplit: false, chunkSizeWarningLimit: 5000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
} as any);
