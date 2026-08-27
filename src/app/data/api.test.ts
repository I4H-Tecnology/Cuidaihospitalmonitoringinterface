import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = 'https://api.cuidai.test';

/** api.ts lê VITE_API_URL no carregamento do módulo, então cada teste
 *  precisa de um import fresco depois de fixar a env. */
const carregarApi = async () => {
  vi.resetModules();
  return import('./api');
};

const respostaOk = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

const respostaErro = (body: unknown, status = 400) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', BASE);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('montagem da requisição', () => {
  it('concatena a base com o caminho', async () => {
    fetchMock.mockResolvedValue(respostaOk([]));
    const { fetchTenants } = await carregarApi();

    await fetchTenants();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/tenants`, expect.anything());
  });

  it('normaliza caminho sem barra inicial', async () => {
    fetchMock.mockResolvedValue(respostaOk([]));
    const { fetchUsers } = await carregarApi();

    await fetchUsers('hospital-1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/users?tenantId=hospital-1`);
  });

  it('remove a barra final da base para não gerar URL com barra dupla', async () => {
    vi.stubEnv('VITE_API_URL', `${BASE}///`);
    fetchMock.mockResolvedValue(respostaOk([]));
    const { fetchTenants } = await carregarApi();

    await fetchTenants();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/tenants`);
  });

  it('escapa o tenantId na query string', async () => {
    fetchMock.mockResolvedValue(respostaOk([]));
    const { fetchAccessLogs } = await carregarApi();

    await fetchAccessLogs('hospital & clínica');

    expect(fetchMock.mock.calls[0][0]).toContain('hospital%20%26%20cl%C3%ADnica');
  });

  it('envia Content-Type JSON', async () => {
    fetchMock.mockResolvedValue(respostaOk([]));
    const { fetchTenants } = await carregarApi();

    await fetchTenants();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  /* Falha de segurança conhecida: nenhuma requisição carrega credencial.
     O backend não recebe token nem cookie, então o RBAC existe só no cliente.
     Quando a autenticação por token entrar, este teste quebra — é a intenção. */
  it('SEGURANÇA: hoje nenhuma requisição envia Authorization', async () => {
    fetchMock.mockResolvedValue(respostaOk([]));
    const { fetchUsers } = await carregarApi();

    await fetchUsers('hospital-1');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });
});

describe('verbos e corpo', () => {
  it('faz POST de login com as credenciais no corpo', async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: '1', login: 'ana' }));
    const { loginRequest } = await carregarApi();

    await loginRequest({ tenant: 'hospital-1', username: 'ana', password: 'Senha@123' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/auth/login`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      tenant: 'hospital-1',
      username: 'ana',
      password: 'Senha@123',
    });
  });

  it('faz PUT ao salvar permissões de um papel', async () => {
    fetchMock.mockResolvedValue(respostaOk({ ok: true }));
    const { savePermissions } = await carregarApi();

    const permissoes = [
      { module: 'patients', view: true, create: false, edit: false, delete: false, web: true, app: false },
    ];
    await savePermissions('hospital-1', 'NURSE', permissoes);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/permissions/hospital-1/NURSE`);
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ permissions: permissoes });
  });

  it('faz DELETE de usuário levando o tenant na query', async () => {
    fetchMock.mockResolvedValue(respostaOk({ ok: true }));
    const { deleteUserRequest } = await carregarApi();

    await deleteUserRequest('hospital-1', 'user-9');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/users/user-9?tenantId=hospital-1`);
    expect(options.method).toBe('DELETE');
  });
});

describe('tratamento de erro', () => {
  it('propaga a mensagem que o backend devolveu', async () => {
    fetchMock.mockResolvedValue(respostaErro({ error: 'Credenciais inválidas.' }, 401));
    const { loginRequest } = await carregarApi();

    await expect(
      loginRequest({ tenant: 'hospital-1', username: 'ana', password: 'errada' }),
    ).rejects.toThrow('Credenciais inválidas.');
  });

  it('usa mensagem genérica quando o corpo do erro não é JSON', async () => {
    const respostaQuebrada = {
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response;
    fetchMock.mockResolvedValue(respostaQuebrada);
    const { fetchTenants } = await carregarApi();

    await expect(fetchTenants()).rejects.toThrow('Erro inesperado.');
  });

  it('deixa a falha de rede subir para quem chamou', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { fetchTenants } = await carregarApi();

    await expect(fetchTenants()).rejects.toThrow('Failed to fetch');
  });
});

describe('configuração ausente', () => {
  it('avisa no console e cai para same-origin quando VITE_API_URL não está definida', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(respostaOk([]));

    const { fetchTenants } = await carregarApi();
    await fetchTenants();

    expect(erro).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tenants');
  });
});
