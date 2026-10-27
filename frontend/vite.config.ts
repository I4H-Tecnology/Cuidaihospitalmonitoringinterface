/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Raiz do repositório, onde mora o .env do projeto inteiro.
const RAIZ = path.resolve(__dirname, '..')

/**
 * `npm run dev` roda direto no Windows, fora do Docker (ver README): lendo o
 * código pela pasta montada no container, cada arquivo levava de 10 a 21 s para
 * abrir na primeira vez. Aqui o .env da raiz faz o papel do bloco
 * `environment:` que o serviço frontend-dev tem no compose, com os mesmos
 * padrões; variável que já vem do ambiente (o próprio compose, quando o
 * frontend-dev sobe) continua valendo. Fora do modo development (build, testes)
 * não mexe em nada.
 */
function servidorDeDesenvolvimento(mode: string) {
  const env: Record<string, string> = mode === 'development' ? loadEnv(mode, RAIZ, '') : {}
  if (mode === 'development') {
    process.env.VITE_API_URL ??= env.VITE_API_URL || 'http://localhost:8000'
    process.env.VITE_VISAO_URL ??= env.VITE_VISAO_URL || 'http://localhost:8001'
    process.env.VITE_MODO_TESTE ??= env.MEDSIGNAL_MODO_TESTE || 'false'
  }
  return {
    // A API só libera CORS para esta porta (CORS_ORIGINS no compose). Ocupada,
    // é melhor falhar na subida do que pular para a 5174 e ver o navegador
    // recusar toda requisição.
    port: Number(env.FRONTEND_DEV_PORT) || 5173,
    strictPort: true,
  }
}

// Arrow com corpo de expressão, não de bloco: o `thresholds.autoUpdate` lá
// embaixo reescreve este arquivo e só reconhece esse formato.
export default defineConfig(({ mode }) => ({
  server: servidorDeDesenvolvimento(mode),
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
        // Piso rebaseado em 27/10/2026 na troca do Vitest 3 pelo 4 (CVE no
        // tinypool e no @vitest/mocker do 3). O provider v8 do 4 remapeia a
        // cobertura pela AST e passou a contar funcoes e branches de arquivo
        // que nenhum teste carrega: functions caiu de 32,64 para 7,11 e
        // branches de 68,47 para 6,9 com os mesmos 171 testes. O denominador
        // mudou, entao o piso antigo deixou de ser comparavel. Valores medidos;
        // a catraca volta a subir a partir daqui.
        lines: 11.03,
        functions: 7.11,
        branches: 6.9,
        statements: 10.62,
      },
    },
  },
}))
