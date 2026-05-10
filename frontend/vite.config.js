import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
  ],
  define: {
    // global: 'window', // nodePolyfills handles this
  },
  server: {
    // host: true,
    // port: 5173,
    // allowedHosts: [
    //   'preliberally-preelemental-lasonya.ngrok-free.dev',
    //   'all'
    // ],
    proxy: {
      '/api': {
        target: process.env.ALLOWED_ORIGINS,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
