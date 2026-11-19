// Prepara o relatório de cobertura do Vitest para o SonarQube.
//
//   node scripts/sonar-cobertura.mjs
//
// O Vitest grava os caminhos do lcov relativos a frontend/ e, no Windows, com
// barra invertida: `SF:src\app\App.tsx`. O scanner roda em Linux, na raiz do
// repositório, e só casa `SF:frontend/src/app/App.tsx`. Sem este ajuste o Sonar
// não encontra nenhum arquivo e mostra 0% de cobertura.
//
// Lê frontend/coverage/lcov.info e escreve frontend/coverage/lcov-sonar.info.
// Não mexe no original.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const entrada = join(raiz, 'frontend', 'coverage', 'lcov.info')
const saida = join(raiz, 'frontend', 'coverage', 'lcov-sonar.info')

if (!existsSync(entrada)) {
  console.error(
    'frontend/coverage/lcov.info não existe. Gere a cobertura antes:\n' +
      '  cd frontend && npx vitest run --coverage --coverage.thresholds.autoUpdate=false',
  )
  process.exit(1)
}

let arquivos = 0
const linhas = readFileSync(entrada, 'utf8')
  .split(/\r?\n/)
  .map((linha) => {
    if (!linha.startsWith('SF:')) return linha
    arquivos += 1
    return 'SF:frontend/' + linha.slice(3).replaceAll('\\', '/')
  })

writeFileSync(saida, linhas.join('\n'))
console.log(`${arquivos} arquivos reescritos em frontend/coverage/lcov-sonar.info`)
