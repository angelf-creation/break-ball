import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps /assets/*.mp4 working when the build is served from a sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
