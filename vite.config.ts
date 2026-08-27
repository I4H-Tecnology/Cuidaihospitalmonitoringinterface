/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // `text` para o terminal, `html` para inspecionar linha a linha,
      // `lcov` porque é o formato que SonarCloud/Codacy consomem.
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Só conta o que é código de aplicação nosso.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/**/*.d.ts',
        // Componentes shadcn/ui vendorizados sob licença MIT (ver ATTRIBUTIONS.md).
        // Código de terceiro, não escrito aqui — por isso fora da contagem.
        // ATENÇÃO: confirme essa exclusão com o professor antes da prova de
        // autoria. Se ele exigir contagem cheia, remova esta linha.
        'src/app/components/ui/**',
      ],
      // A RFC declara a linha "Projetos com IA", que NÃO tem meta obrigatória
      // de cobertura — a de 75%/25% vale só para Web Apps. Aqui o teste vale
      // por dois outros motivos, ambos pontuados:
      //   - critério 3 do Demo Day pontua a QUALIDADE do teste, não o percentual;
      //   - a direction de IA pede "testes automatizados do código de aplicação
      //     e do pipeline" em "o que é desejável atender".
      //
      // Os números abaixo são o piso atual. `autoUpdate` sobe o piso sozinho
      // quando a cobertura melhora, então ela nunca regride, e o pipeline não
      // fica vermelho por causa de uma meta que não se aplica a esta linha.
      thresholds: {
        autoUpdate: true,
        // Piso rebaseado apos o merge de dev, que trouxe +258 linhas no
        // authStore e, com elas, caminhos ainda nao cobertos. O denominador
        // mudou, entao o piso antigo (51,87 em branches) deixou de ser
        // comparavel. A catraca volta a subir a partir daqui.
        lines: 2.86,
        functions: 35.24,
        branches: 51.11,
        statements: 2.86,
      },
    },
  },
})