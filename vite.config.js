import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

function redirectDirectoryRoutes({ middlewares }) {
  middlewares.use((request, response, next) => {
    const location = request.url
      ?.replace(/^\/(?:colour|color\/?)(?=\?|$)/, '/colour/')
      .replace(/^\/home(?=\?|$)/, '/home/')
    if (location && location !== request.url) {
      response.writeHead(302, { Location: location }).end()
      return
    }
    next()
  })
}

export default defineConfig({
  plugins: [
    vue(),
    {
      // Match the static host's directory redirect before Vite falls back to the dashboard.
      name: 'directory-redirect',
      configureServer: redirectDirectoryRoutes,
      configurePreviewServer: redirectDirectoryRoutes
    }
  ],
  base: '/',
  build: {
    // three.js is most of the card page (~150 KB gzipped). Expected for a 3D page, so don't warn.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // alexsue.com/xmas26/: the family card, with its own entry and shared GA4 setup.
        xmas26: resolve(import.meta.dirname, 'xmas26/index.html'),
        colour: resolve(import.meta.dirname, 'colour/index.html'),
        home: resolve(import.meta.dirname, 'home/index.html')
      }
    }
  }
})
