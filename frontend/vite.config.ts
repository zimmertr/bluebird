import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Three entries, because two of these pages are real URLs rather than app
    // state. Vite builds only what is named here, so an HTML file left out of
    // this list is silently dropped from dist.
    //
    // The output paths are load-bearing. Starlette's StaticFiles(html=True)
    // serves dist/privacy/index.html as the directory index for /privacy/, and
    // dist/404.html for any path that doesn't resolve, so the build is most of
    // the wiring for both.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
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
