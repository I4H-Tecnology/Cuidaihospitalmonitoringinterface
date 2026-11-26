import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { SystemToastProvider } from './ui/SystemToast';
import { LoginScreen } from './LoginScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
const loginFalso = vi.hoisted(() => vi.fn());
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao({ login: loginFalso }));

beforeEach(() => localStorage.setItem('tenant', 'clinica-teste'));
afterEach(() => {
  vi.unstubAllGlobals();
  loginFalso.mockReset();
});

const abrir = () => render(<SystemToastProvider><LoginScreen /></SystemToastProvider>);
const corpoDoPost = (api: ReturnType<typeof fetchFalso>, trecho: string) => {
  const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes(trecho));
  return JSON.parse(String(envio?.[1]?.body));
};
/** O formulário de trás também tem um campo "Login"; o da janela de primeiro acesso é o de id próprio. */
const campoLoginDaJanela = () => screen.getAllByLabelText('Login').find((c) => c.id === 'loginscreen-login') as HTMLInputElement;

describe('Login: primeiro acesso (troca obrigatória de senha)', () => {
  const entrarComSenhaProvisoria = async () => {
    loginFalso.mockResolvedValue({ success: false, requiresPasswordChange: true, error: 'Troque a senha provisória.' });
    abrir();
    await userEvent.type(document.getElementById('username') as HTMLInputElement, 'ana.souza');
    await userEvent.type(document.getElementById('password') as HTMLInputElement, 'Provisoria#1');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    return screen.findByText('Troca obrigatória de senha');
  };

  it('abre a janela com o login já preenchido, e cada rótulo leva ao campo dele', async () => {
    await entrarComSenhaProvisoria();

    expect(campoLoginDaJanela()).toHaveValue('ana.souza');
    for (const rotulo of ['Login', 'Nova senha', 'Confirmar nova senha']) {
      const texto = screen.getAllByText(rotulo).find((e) => e.tagName === 'LABEL' && e.getAttribute('for')?.startsWith('loginscreen-'))!;
      await userEvent.click(texto);
      expect(document.getElementById(texto.getAttribute('for')!)).toHaveFocus();
    }
  });

  it('senhas diferentes: avisa e não envia', async () => {
    const api = fetchFalso();
    await entrarComSenhaProvisoria();

    await userEvent.type(screen.getByLabelText('Nova senha'), 'Nova#Senha2026');
    await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'Outra#Senha2026');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('As senhas não conferem.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('senhas iguais: manda a troca, avisa e fecha a janela', async () => {
    const api = fetchFalso([[/^POST .*\/api\/auth\/force-change-password/, { ok: true }]]);
    await entrarComSenhaProvisoria();

    await userEvent.type(screen.getByLabelText('Nova senha'), 'Nova#Senha2026');
    await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'Nova#Senha2026');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('Senha alterada. Faça login novamente com a nova senha.')).toBeInTheDocument();
    expect(corpoDoPost(api, '/force-change-password')).toEqual({ tenant: 'clinica-teste', username: 'ana.souza', currentPassword: 'Provisoria#1', newPassword: 'Nova#Senha2026' });
    await waitFor(() => expect(screen.queryByText('Troca obrigatória de senha')).toBeNull());
  });
});

describe('Login: esqueci a senha', () => {
  const abrirRecuperacao = async () => {
    abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Esqueceu a sua senha?' }));
    return screen.findByLabelText('E-mail');
  };

  it('e-mail sem domínio completo: avisa e não envia', async () => {
    const api = fetchFalso();
    const campo = await abrirRecuperacao();

    await userEvent.type(campo, 'ana@clinica'); // o navegador aceita, a validação do sistema não
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('e-mail válido: manda o pedido, avisa e volta para o login', async () => {
    const api = fetchFalso([[/^POST .*\/api\/auth\/forgot-password\/request/, {}]]);
    const campo = await abrirRecuperacao();

    await userEvent.type(campo, '  Ana.Souza@Clinica.com.br ');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Se o cadastro existir, enviaremos instruções para o e-mail cadastrado.')).toBeInTheDocument();
    expect(corpoDoPost(api, '/forgot-password/request')).toEqual({ tenant: 'clinica-teste', email: 'ana.souza@clinica.com.br' });
    expect(await screen.findByRole('heading', { name: 'Login e senha' })).toBeInTheDocument();
  });

  it('a API recusar: mostra o motivo e continua na recuperação', async () => {
    fetchFalso([[/^POST .*\/api\/auth\/forgot-password\/request/, () => erroHttp(429, 'Muitas tentativas. Aguarde.')]]);
    const campo = await abrirRecuperacao();

    await userEvent.type(campo, 'ana@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Muitas tentativas. Aguarde.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  });
});
