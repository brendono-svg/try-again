import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds to a single self-contained dist/index.html so the app can be opened
// straight from disk (or hosted anywhere static) with no server and no uploads.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  worker: { format: 'iife' },
  build: { chunkSizeWarningLimit: 4000 },
  test: { environment: 'node' },
} as any);
