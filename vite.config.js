import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    // three.js is most of the card page (~150 KB gzipped). Expected for a 3D page, so don't warn.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // alexsue.com/xmas26/: the family card. Its own entry, so it never loads the dashboard's analytics.
        xmas26: resolve(import.meta.dirname, 'xmas26/index.html')
      }
    }
  }
})
