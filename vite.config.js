import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    watch: {
      // Update Database regenerates this registry. Reloading the renderer while
      // that maintenance pass is still running interrupts later linkage repair
      // phases and prevents their audit summary from being saved in Dev mode.
      ignored: ['**/src/ai/genome/generated/generatedGenomeCards.js'],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
  },
})
