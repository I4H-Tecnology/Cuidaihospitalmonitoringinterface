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

type Rota = [RegExp, unknown | ((url: string) => unknown)];

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Troca o `fetch` global. `rotas` casa a URL na ordem e devolve o JSON da rota;
 * o que não casar devolve `padrao` (lista vazia). Devolve o mock para conferir chamadas.
 */
export function fetchFalso(rotas: Rota[] = [], padrao: unknown = []) {
  const mock = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    for (const [padraoDaRota, corpo] of rotas) {
      if (padraoDaRota.test(url)) {
        return resposta(typeof corpo === 'function' ? (corpo as (u: string) => unknown)(url) : corpo);
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
