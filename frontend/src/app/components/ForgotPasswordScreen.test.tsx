import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { SystemToastProvider } from './ui/SystemToast';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => localStorage.setItem('tenant', 'clinica-teste'));
afterEach(() => vi.unstubAllGlobals());

const abrir = () => render(<SystemToastProvider><ForgotPasswordScreen onBack={() => {}} /></SystemToastProvider>);

describe('Esqueceu a sua senha?', () => {
  it('clicar no rótulo "E-mail" leva o foco ao campo', async () => {
    abrir();

    await userEvent.click(screen.getByText('E-mail'));

    expect(screen.getByLabelText('E-mail')).toHaveFocus();
  });

  it('e-mail sem domínio completo: avisa e não envia', async () => {
    const api = fetchFalso();
    abrir();

    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@clinica');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('e-mail válido: manda o pedido e passa para a etapa do código', async () => {
    const api = fetchFalso([[/^POST .*\/api\/auth\/forgot-password\/request/, { devResetCode: '123456' }]]);
    abrir();

    await userEvent.type(screen.getByLabelText('E-mail'), ' Ana@Clinica.com ');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByPlaceholderText('Código de recuperação')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url]) => String(url).includes('/forgot-password/request'));
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ tenant: 'clinica-teste', email: 'ana@clinica.com' });
    expect(screen.getByLabelText('E-mail')).toBeDisabled(); // o e-mail fica travado depois de enviado
  });
});
