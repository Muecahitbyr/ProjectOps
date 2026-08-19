import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE_PATH: optionaler Unterpfad-Praefix (z.B. "/office"), falls die
// App nicht am Domain-Root ausgeliefert wird, sondern z.B. hinter einem
// Reverse-Proxy/einer Rewrite-Regel unter einem Pfad wie
// https://example.com/office laeuft. Leer/unset = normales Root-Deployment
// (unveraendertes Verhalten). Siehe auch App.tsx (Router-basename) und
// realtimeClient.ts (WebSocket-URL) - beide lesen denselben Wert.
const basePath = process.env.VITE_BASE_PATH || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: `${basePath}/`,
})
