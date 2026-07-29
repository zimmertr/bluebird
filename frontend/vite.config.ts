import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Four entries, because three of these pages are real URLs rather than app
    // state. Vite builds only what is named here, so an HTML file left out of
    // this list is silently dropped from dist.
    //
    // The output paths are load-bearing. Starlette's StaticFiles(html=True)
    // serves dist/privacy/index.html and dist/terms/index.html as the directory
    // indexes for /privacy/ and /terms/, and dist/404.html for any path that
    // doesn't resolve, so the build is most of the wiring for all three.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        terms: resolve(__dirname, 'terms/index.html'),
        notFound: resolve(__dirname, '404.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
