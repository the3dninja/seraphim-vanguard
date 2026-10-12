import { defineConfig } from 'vite';

// "./" keeps asset paths relative, so the build works on GitHub Pages
// (served from /seraphim-vanguard/) and locally alike.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
