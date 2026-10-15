import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During development, /api and /media are forwarded to the Node server, so the app
// works on localhost and from other devices on the network without any CORS setup.
const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_TARGET },
      '/media': { target: API_TARGET },
    },
  },
})
