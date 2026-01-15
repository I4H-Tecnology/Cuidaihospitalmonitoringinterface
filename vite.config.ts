import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', 
  build: {
    target: 'es2015', // Usa um padrão de JS mais compatível
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      external: [/^figma:/], // Remove qualquer resquício do Figma
    },
  },
})
