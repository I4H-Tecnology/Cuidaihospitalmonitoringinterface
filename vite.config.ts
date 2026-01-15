import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '', // Isso é fundamental para o deploy em subpastas ou hosts específicos
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      external: [/^figma:/],
    },
  },
})
