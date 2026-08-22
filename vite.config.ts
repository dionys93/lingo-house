import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // bind 0.0.0.0 so the Codespaces forwarder can reach it
    port: 5173,
    strictPort: true,  // fail loudly instead of drifting to 5174 behind a URL pinned to 5173
  },
})
