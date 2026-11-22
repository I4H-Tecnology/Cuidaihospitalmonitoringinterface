import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { SystemToastProvider } from './ui/SystemToast';
import { UsersScreen } from './UsersScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
// Usuário Sistema: é o único que pode alterar a política de segurança e as permissões de qualquer perfil.
vi.mock('@/app/contexts/AuthContext', async () => {
  const h = await import('@/test/telas');
  return h.moduloDeAutenticacao({ user: h.usuarioDeTeste('SYSTEM') });
});

afterEach(() => vi.unstubAllGlobals());

const bruno = {
  id: 'u-2', tenantId: 'clinica-teste', name: 'Bruno Lima', email: 'bruno@clinica.com', login: 'bruno.lima', passwordHash: '',
  role: 'NURSE', status: 'active', platforms: ['web', 'app'], unit: 'Clínica Teste', createdAt: '2026-11-01T10:00:00Z',
  failedAttempts: 0, isSystemUser: false,
};
const permissoes = [{ module: 'pacientes', view: true, create: false, edit: false, delete: false, web: true, app: true }];

/** Monta o servidor falso; `usuarios` é o que a API devolve agora (muda ao longo do teste). */
function servidor(usuarios: unknown[], extras: Array<[RegExp, unknown]> = []) {
  const lista = { atual: usuarios };
  const api = fetchFalso([
    ...extras,
    [/^GET .*\/api\/users/, () => lista.atual],
    [/^GET .*\/api\/permissions\//, permissoes],
    [/^GET .*\/api\/access-logs/, []],
    [/^GET .*\/api\/security-policy/, {}],
    [/^POST .*\/api\/access-logs/, { ok: true }],
    [/^(POST|PUT|DELETE) .*\/api\/(users|permissions|security-policy)/, { ok: true, id: 'u-9' }],
  ]);
  return { api, lista };
}

const abrir = () => render(<SystemToastProvider><UsersScreen /></SystemToastProvider>);

/** O que foi enviado para o registro de auditoria, na ordem. */
const auditoria = (api: ReturnType<typeof fetchFalso>) =>
  api.mock.calls
    .filter(([url, init]) => init?.method === 'POST' && String(url).includes('/api/access-logs'))
    .map(([, init]) => JSON.parse(String(init?.body)).log as { action: string; module: string; status: string });

/*
 * Toda mudança que dá certo no servidor (usuário, permissão, política) é registrada na trilha de
 * auditoria com `void recordAccessLog(...)`: a tela não espera o registro. Dois comportamentos
 * importam: o registro sai com a ação certa, e se o registro falhar a ação do usuário não é afetada.
 */
describe('Usuários: auditoria das mudanças', () => {
  it('excluir um usuário: ele sai da lista e a exclusão vai para a auditoria', async () => {
    const { api, lista } = servidor([bruno]);
    abrir();
    await screen.findByText('Bruno Lima');
    lista.atual = []; // depois de excluir, a API devolve a lista sem ele

    await userEvent.click(screen.getByTitle('Excluir'));

    await waitFor(() => expect(screen.queryByText('Bruno Lima')).toBeNull());
    expect(chamadas(api, /^DELETE .*\/api\/users\/u-2/)).toBe(1);
    await waitFor(() => expect(auditoria(api)).toEqual([expect.objectContaining({ action: 'Exclusao de usuario', module: 'Usuarios', status: 'SUCESSO' })]));
  });

  it('o registro de auditoria falhando não atrapalha: o usuário sai da lista e nenhum erro aparece', async () => {
    const { api, lista } = servidor([bruno], [[/^POST .*\/api\/access-logs/, () => erroHttp(500, 'Auditoria fora do ar.')]]);
    abrir();
    await screen.findByText('Bruno Lima');
    lista.atual = [];

    await userEvent.click(screen.getByTitle('Excluir'));

    await waitFor(() => expect(screen.queryByText('Bruno Lima')).toBeNull());
    await waitFor(() => expect(auditoria(api)).toHaveLength(1)); // tentou registrar
    expect(screen.queryByRole('alert')).toBeNull(); // e a falha não virou mensagem para a pessoa
  });

  it('criar um usuário: manda os dados, atualiza a lista e registra a criação', async () => {
    const { api, lista } = servidor([bruno]);
    abrir();
    await screen.findByText('Bruno Lima');
    await userEvent.click(screen.getByRole('button', { name: /Novo Usuário/ }));
    await screen.findByLabelText('Nome Completo *');

    await userEvent.type(screen.getByLabelText('Nome Completo *'), 'Carla Dias');
    await userEvent.type(screen.getByLabelText('E-mail *'), 'carla@clinica.com');
    await userEvent.type(screen.getByLabelText('Login *'), 'carla.dias');
    await userEvent.type(screen.getByLabelText('Senha *'), 'Cl!nica#Forte2026');
    await userEvent.type(screen.getByLabelText('Confirmar Senha'), 'Cl!nica#Forte2026');
    lista.atual = [bruno, { ...bruno, id: 'u-9', name: 'Carla Dias', email: 'carla@clinica.com', login: 'carla.dias' }];
    await userEvent.click(screen.getByRole('button', { name: 'Criar Usuário' }));

    expect(await screen.findByText('Carla Dias')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/users'));
    expect(JSON.parse(String(envio?.[1]?.body)).user).toMatchObject({ name: 'Carla Dias', email: 'carla@clinica.com', login: 'carla.dias' });
    await waitFor(() => expect(auditoria(api).map((a) => a.action)).toContain('Criacao de usuario'));
  });

  it('e-mail inválido: avisa e não envia nada', async () => {
    const { api } = servidor([bruno]);
    abrir();
    await screen.findByText('Bruno Lima');
    await userEvent.click(screen.getByRole('button', { name: /Novo Usuário/ }));
    await userEvent.type(await screen.findByLabelText('Nome Completo *'), 'Carla Dias');
    await userEvent.type(screen.getByLabelText('E-mail *'), 'carla-sem-arroba');
    await userEvent.type(screen.getByLabelText('Login *'), 'carla.dias');

    await userEvent.click(screen.getByRole('button', { name: 'Criar Usuário' }));

    expect(await screen.findByText('Informe um e-mail válido, como nome@dominio.com.')).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/api\/users/)).toBe(0);
  });

  it('editar um usuário: manda a alteração e registra', async () => {
    const { api } = servidor([bruno]);
    abrir();
    await screen.findByText('Bruno Lima');
    await userEvent.click(screen.getByTitle('Editar'));

    const nome = await screen.findByLabelText('Nome Completo *');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Bruno Lima Souza');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar Usuário' }));

    await waitFor(() => expect(chamadas(api, /^PUT .*\/api\/users\/u-2/)).toBe(1));
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'PUT' && String(url).includes('/api/users/u-2'));
    expect(JSON.parse(String(envio?.[1]?.body)).user).toMatchObject({ name: 'Bruno Lima Souza' });
    await waitFor(() => expect(auditoria(api).map((a) => a.action)).toContain('Alteracao de usuario'));
  });

  it('ligar uma permissão: salva e registra qual permissão mudou e de quê para quê', async () => {
    const { api } = servidor([bruno]);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Perfis e Permissões/ }));

    await userEvent.click(await screen.findByTitle('Criar: negado'));

    await waitFor(() => expect(chamadas(api, /^PUT .*\/api\/permissions\//)).toBe(1));
    expect(await screen.findByTitle('Criar: permitido')).toBeInTheDocument();
    await waitFor(() => {
      const [registro] = auditoria(api);
      expect(registro.module).toBe('Permissoes');
      expect(registro.action).toContain('Criar: inativo -> ativo');
    });
  });

  it('a API recusar salvar a permissão: avisa e desfaz a chave na tela', async () => {
    const { api } = servidor([bruno], [[/^PUT .*\/api\/permissions\//, () => erroHttp(500, 'Sem acesso ao banco.')]]);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Perfis e Permissões/ }));

    await userEvent.click(await screen.findByTitle('Criar: negado'));

    expect(await screen.findByText('Não foi possível salvar as permissões.')).toBeInTheDocument();
    expect(screen.getByTitle('Criar: negado')).toBeInTheDocument(); // voltou ao que era
    expect(auditoria(api)).toHaveLength(0); // não houve mudança, não há o que registrar
  });

  it('salvar as permissões do perfil: registra', async () => {
    const { api } = servidor([bruno]);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Perfis e Permissões/ }));
    await screen.findByTitle('Criar: negado');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(auditoria(api).map((a) => a.action)).toContain('Salvar permissoes do perfil'));
  });

  it('salvar a política de senha: registra', async () => {
    const { api } = servidor([bruno]);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /^Segurança$/ }));

    await userEvent.click(await screen.findByRole('button', { name: /Salvar Políticas/ }));

    await waitFor(() => expect(chamadas(api, /^PUT .*\/api\/security-policy/)).toBe(1));
    await waitFor(() => expect(auditoria(api)).toEqual([expect.objectContaining({ action: 'Alteracao de politica de senha', module: 'Seguranca' })]));
  });
});
