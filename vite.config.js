import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages: the app (index.html) and the welcome page with the whale arrival
// and the sign-in (welcome/index.html), which plain visits are sent to first.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        welcome: resolve(import.meta.dirname, 'welcome/index.html'),
      },
    },
  },
});
