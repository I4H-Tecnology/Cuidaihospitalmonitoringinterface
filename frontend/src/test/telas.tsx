/**
 * Ferramentas para testar uma tela inteira sem backend: login falso e `fetch`
 * falso por rota. Uso, no topo do arquivo de teste (o vi.mock é içado):
 *
 *   vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());
 */
import { vi } from 'vitest';

export const TENANT_DE_TESTE = 'clinica-teste';

export function usuarioDeTeste(papel = 'ADMIN') {
  return {
    id: 'u-1',
    tenantId: TENANT_DE_TESTE,
    login: 'ana.souza',
    name: 'Ana Souza',
    role: papel,
    roleLabel: 'Administrador',
    avatar: 'AS',
    platforms: ['web', 'app'],
  };
}

/** Valor do useAuth(): usuário logado que pode tudo (a permissão real é do servidor). */
export function autenticacaoDeTeste(sobrepor: Record<string, unknown> = {}) {
  return {
    user: usuarioDeTeste(),
    tenantId: TENANT_DE_TESTE,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    can: () => true,
    podeAbrirTela: () => true,
    recordAccess: vi.fn(),
    ...sobrepor,
  };
}

export function moduloDeAutenticacao(sobrepor: Record<string, unknown> = {}) {
  const valor = autenticacaoDeTeste(sobrepor);
  return {
    useAuth: () => valor,
    AuthProvider: ({ children }: { children: unknown }) => children,
  };
}

type Rota = [RegExp, unknown | ((url: string, init?: RequestInit) => unknown)];

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Troca o `fetch` global. `rotas` casa, na ordem, o texto "MÉTODO url" (ex.: "POST http://x/api/lembretes")
 * e devolve o JSON da rota; o que não casar devolve `padrao` (lista vazia). Uma rota pode ser uma
 * função (url, init) => corpo. Devolve o mock para conferir chamadas.
 */
export function fetchFalso(rotas: Rota[] = [], padrao: unknown = []) {
  const mock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const alvo = `${(init?.method ?? 'GET').toUpperCase()} ${url}`;
    for (const [padraoDaRota, corpo] of rotas) {
      if (padraoDaRota.test(alvo)) {
        const saida = typeof corpo === 'function' ? (corpo as (u: string, i?: RequestInit) => unknown)(url, init) : corpo;
        return saida instanceof Response ? saida : resposta(saida);
      }
    }
    return resposta(padrao);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** `fetch` em que toda chamada volta com erro da API (HTTP 500 e {"error": mensagem}). */
export function fetchComFalha(mensagem = 'Banco indisponível.', status = 500) {
  const mock = vi.fn(async () => resposta({ error: mensagem }, status));
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Quantas chamadas `fetch` casam com o padrão ("MÉTODO url"). */
export function chamadas(mock: ReturnType<typeof fetchFalso>, padrao: RegExp): number {
  return mock.mock.calls.filter(([entrada, init]) => padrao.test(`${(init?.method ?? 'GET').toUpperCase()} ${String(entrada)}`)).length;
}

/** Resposta HTTP de erro para uma rota: `() => erroHttp(500, 'Falhou.')`. */
export function erroHttp(status = 500, mensagem = 'Falhou.'): Response {
  return resposta({ error: mensagem }, status);
}
