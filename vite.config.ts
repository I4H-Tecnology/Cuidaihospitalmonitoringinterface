import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Isso garante que os caminhos dos arquivos sejam relativos
  build: {
    rollupOptions: {
      external: [/^figma:/], // Continua ignorando os links quebrados do Figma
    },
  },
})
