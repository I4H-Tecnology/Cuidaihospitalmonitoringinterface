import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Isso impede que o build trave por causa dos links do Figma
      external: [/^figma:/],
    },
  },
})
